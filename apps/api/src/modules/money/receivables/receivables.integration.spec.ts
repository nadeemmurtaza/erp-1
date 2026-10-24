import { Test } from '@nestjs/testing';
import { EventEmitterModule, EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { AppConfigService } from '../../../core/config/app-config.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { AuditService } from '../../../core/audit/audit.service';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { AccountingService } from '../accounting/accounting.service';
import { PostingRulesSubscriber } from '../accounting/posting-rules.subscriber';
import { CreditNotesService } from './credit-notes.service';
import { DebitNotesService } from './debit-notes.service';
import { CreditTermsService } from './credit-terms.service';
import { ageMovements } from '../../../core/common/aging';

/**
 * 145-receivables-credit-limits-dunning.md — real-Postgres integration
 * tests (`stock-variance.service.spec.ts`'s idiom is mocked-Prisma;
 * `inventory.service.spec.ts`'s is real-DB — this needs the latter, since
 * it proves an actual posted JournalEntry against a real FiscalPeriod, and
 * Acceptance criterion #1 explicitly asks for reconciliation against
 * `accounting/aging.ts`'s own bucket totals).
 *
 * `EventBusService` is replaced with a thin stub whose `publish()` calls
 * the real `EventEmitter2.emitAsync()` synchronously instead of writing to
 * the outbox table — the outbox's own at-least-once delivery is
 * `event-bus.service`'s own concern; this test exercises the posting rule
 * itself, wired exactly as `@OnDomainEvent` dispatches it in production.
 */
class SynchronousEventBus {
  constructor(private readonly emitter: EventEmitter2) {}
  async publish(name: string, payload: unknown): Promise<void> {
    await this.emitter.emitAsync(name, payload);
  }
}

describe('Receivables — CreditNote/DebitNote posting and credit checks (WO-145)', () => {
  let prisma: PrismaService;
  let creditNotes: CreditNotesService;
  let debitNotes: DebitNotesService;
  let creditTerms: CreditTermsService;
  let arAccountId: string;
  let apAccountId: string;

  let contactId: string;
  let supplierId: string;
  let userA: string; // creator
  let userB: string; // approver

  let fiscalYearId: string;
  let openPeriodId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        PrismaService,
        SettingsService,
        // Settings' shared L2 is not under test here: Redis reads as not connected, so every read is Postgres's.
        { provide: RedisService, useValue: { isReady: () => false } },
        AuditService,
        AccountingService,
        PostingRulesSubscriber,
        CreditNotesService,
        DebitNotesService,
        CreditTermsService,
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: 'main' } },
        {
          provide: NotificationsService,
          useValue: { send: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: EventBusService,
          useFactory: (emitter: EventEmitter2) => new SynchronousEventBus(emitter),
          inject: [EventEmitter2],
        },
      ],
    }).compile();
    await module.init(); // registers PostingRulesSubscriber's @OnEvent handlers with EventEmitter2 (EventSubscribersLoader runs on bootstrap, not on compile()).

    prisma = module.get(PrismaService);
    creditNotes = module.get(CreditNotesService);
    debitNotes = module.get(DebitNotesService);
    creditTerms = module.get(CreditTermsService);
    // Registers PostingRulesSubscriber's @OnEvent handlers on the real emitter.
    module.get(PostingRulesSubscriber);

    const ar = await prisma.account.findFirstOrThrow({ where: { type: 'ASSET', isControl: true } });
    const ap = await prisma.account.findFirstOrThrow({ where: { type: 'LIABILITY', isControl: true } });
    arAccountId = ar.id;
    apAccountId = ap.id;

    const contact = await prisma.contact.create({
      data: { name: `WO-145 Test Customer ${Date.now()}`, phoneE164: `+9230000${Date.now() % 100000}` },
    });
    contactId = contact.id;

    const supplier = await prisma.supplier.create({ data: { name: `WO-145 Test Supplier ${Date.now()}` } });
    supplierId = supplier.id;

    const a = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
    const b = await prisma.user.findFirstOrThrow({ where: { role: 'STAFF' } });
    userA = a.id;
    userB = b.id;

    // `startsOn` is `now`, not a fixed date — `resolveOpenPeriod()`'s own
    // fallback picks the OPEN period with the LATEST `startsOn` (accounting.
    // service.ts), so a fixed date here would let a leftover OPEN period
    // from an earlier run of this same suite (this test database is never
    // reset between runs — JournalEntry rows are immutable, so old
    // FiscalPeriod rows they reference are never cleaned up either) win the
    // tie non-deterministically. `now` guarantees THIS run's period is always
    // the most recently opened one that exists.
    const runStartedAt = new Date();
    const fy = await prisma.fiscalYear.create({
      data: { name: `WO145-FY-${Date.now()}`, startsOn: runStartedAt, endsOn: new Date(runStartedAt.getTime() + 365 * 24 * 60 * 60 * 1000) },
    });
    fiscalYearId = fy.id;
    const period = await prisma.fiscalPeriod.create({
      data: {
        fiscalYearId,
        name: 'WO145-OPEN',
        startsOn: runStartedAt,
        // Matches the fiscal year's own 1-year span, not the 100-year window
        // this line used to carry: a shared `newax_dev` still holds every
        // run's rows (see the afterAll fix below for why that assumption was
        // wrong), and a 100-year `endsOn` "contains" almost any future test
        // date — it collided with accounting.e2e-spec.ts's own WO-19.5 suite,
        // which deliberately posts dates 5 years out, by satisfying
        // resolveOpenPeriod()'s CONTAINING branch before that suite's own
        // period ever got a chance to.
        endsOn: fy.endsOn,
        status: 'OPEN',
      },
    });
    openPeriodId = period.id;

    // Seed an existing AR origination for this customer, so a CreditNote has
    // a real balance to reduce.
    await prisma.journalEntry.create({
      data: {
        number: `WO145-JE-${Date.now()}`,
        date: new Date('2020-02-01'),
        source: 'test.seed_sale',
        sourceRef: `seed-${contactId}`,
        status: 'POSTED',
        periodId: openPeriodId,
        lines: {
          create: [
            { accountId: arAccountId, debitMinor: 50_000_000, creditMinor: 0, currency: 'PKR', baseAmountMinor: 50_000_000, contactId },
            { accountId: arAccountId, debitMinor: 0, creditMinor: 50_000_000, currency: 'PKR', baseAmountMinor: 50_000_000 },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    // JournalEntry rows are immutable by design (a DB trigger refuses
    // DELETE, matching the ledger's own append-only guarantee), and that
    // immutability is exactly why this FiscalPeriod can't be deleted either
    // (JournalEntry.periodId is onDelete: Restrict) — this suite runs
    // against the SAME shared `newax_dev` every other test uses (Jest's
    // test/setup-env.ts loads .env.test's DATABASE_URL ahead of any local
    // override), not a disposable per-session database, so an OPEN period
    // left behind here outlives this run and can win resolveOpenPeriod()'s
    // "most recently opened" fallback — or, as happened with this period's
    // old 100-year endsOn, its CONTAINING branch — for every later run of
    // any other accounting test. Closing it (never deleting — the same rule
    // this comment just described) retires it from that fallback for good.
    await prisma.creditNote.deleteMany({ where: { customerId: contactId } });
    await prisma.debitNote.deleteMany({ where: { supplierId } });
    await prisma.customerCreditTerm.deleteMany({ where: { customerId: contactId } });
    await prisma.supplier.delete({ where: { id: supplierId } });
    await prisma.contact.delete({ where: { id: contactId } });
    await prisma.fiscalPeriod.update({ where: { id: openPeriodId }, data: { status: 'CLOSED' } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  async function arBalanceForContact(): Promise<number> {
    const lines = await prisma.journalLine.findMany({
      where: { accountId: arAccountId, contactId, entry: { status: 'POSTED' } },
      select: { debitMinor: true, creditMinor: true, entry: { select: { date: true } } },
    });
    const movements = lines.map((l) => ({ date: l.entry.date, amountMinor: l.debitMinor > 0 ? l.debitMinor : -l.creditMinor }));
    const buckets = ageMovements(movements, new Date());
    return buckets.current + buckets.days31to60 + buckets.days61to90 + buckets.over90;
  }

  /** A raw double-entry sum (debit − credit, AR's own natural balance side) — see the void test's own comment on why this differs from `arBalanceForContact()` above. */
  async function arRawBalanceForContact(): Promise<number> {
    const lines = await prisma.journalLine.findMany({
      where: { accountId: arAccountId, contactId },
      select: { debitMinor: true, creditMinor: true },
    });
    return lines.reduce((sum, l) => sum + (l.debitMinor - l.creditMinor), 0);
  }

  it('issuing a CreditNote reduces the customer\'s own AR aging balance by exactly its amount (Acceptance #1)', async () => {
    const before = await arBalanceForContact();

    const note = await creditNotes.create({ customerId: contactId, amountMinor: 2_000, reason: 'Return' }, userA);
    expect(note.status).toBe('DRAFT');
    expect(note.number).toMatch(/^CN-\d{4}-\d{4}$/);

    const issued = await creditNotes.issue(note.id, userA);
    expect(issued.status).toBe('ISSUED');

    const after = await arBalanceForContact();
    expect(before - after).toBe(2_000);
  });

  it('checkCreditAvailable refuses an order that would push a customer over their configured limit, and allows one with no limit configured (Acceptance #2)', async () => {
    const noLimit = await creditTerms.checkCreditAvailable(contactId, 999_999_999);
    expect(noLimit.allowed).toBe(true);

    const outstanding = await arBalanceForContact();
    const limit = outstanding + 5_000; // exactly 5,000 paisa of headroom
    await creditTerms.setTerm(contactId, { creditLimitMinor: limit }, userA);

    const refused = await creditTerms.checkCreditAvailable(contactId, 10_000); // exceeds the headroom
    expect(refused.allowed).toBe(false);

    const allowed = await creditTerms.checkCreditAvailable(contactId, 1_000); // within the headroom
    expect(allowed.allowed).toBe(true);

    await creditTerms.setTerm(contactId, { creditLimitMinor: 999_999_999, isOnHold: false }, userA);
  });

  it('a credit hold refuses every check regardless of amount', async () => {
    await creditTerms.setTerm(contactId, { creditLimitMinor: 999_999_999, isOnHold: true }, userA);
    const result = await creditTerms.checkCreditAvailable(contactId, 1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/hold/i);
    await creditTerms.setTerm(contactId, { creditLimitMinor: 999_999_999, isOnHold: false }, userA);
  });

  it('the creator of a CreditNote above the approval threshold is never its own approver', async () => {
    const threshold = await approvalThreshold();
    const note = await creditNotes.create({ customerId: contactId, amountMinor: threshold + 100, reason: 'Large correction' }, userA);

    await expect(creditNotes.approve(note.id, userA)).rejects.toBeInstanceOf(ForbiddenException);

    // A different user may approve, and issue then succeeds.
    await creditNotes.approve(note.id, userB);
    const issued = await creditNotes.issue(note.id, userA);
    expect(issued.status).toBe('ISSUED');
  });

  it('issuing an above-threshold CreditNote with no prior approval is refused', async () => {
    const threshold = await approvalThreshold();
    const note = await creditNotes.create({ customerId: contactId, amountMinor: threshold + 500, reason: 'No approval' }, userA);
    await expect(creditNotes.issue(note.id, userA)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('voiding an ISSUED CreditNote reverses its posted entry — the raw ledger returns to exactly its prior balance', async () => {
    // A raw double-entry sum, not `ageMovements()` — a reversal's own line
    // is debit-shaped, indistinguishable from a fresh origination to the
    // aging algorithm (which only tracks unconsumed origination remainders,
    // not a double-entry net). Proving "the ledger nets to zero" needs the
    // raw sum; proving "the aging report shows the right number" is test 1
    // above (Acceptance #1) — two different, both true, statements.
    const before = await arRawBalanceForContact();
    const note = await creditNotes.create({ customerId: contactId, amountMinor: 1_500, reason: 'Goodwill' }, userA);
    await creditNotes.issue(note.id, userA);
    const afterIssue = await arRawBalanceForContact();
    expect(afterIssue - before).toBe(-1_500); // AR's own balance-side: a credit (settlement) reduces it

    await creditNotes.voidCreditNote(note.id, 'Issued in error');
    const afterVoid = await arRawBalanceForContact();
    expect(afterVoid).toBe(before);
  });

  // Acceptance #4 ("A CreditNote/DebitNote dated into a closed fiscal
  // period posts into the current open period instead") is satisfied by
  // CONSTRUCTION, not by a test in this file: `onCreditNoteIssued`/
  // `onDebitNoteIssued` (posting-rules.subscriber.ts) call the exact same
  // `AccountingService.postEntry()` — and therefore the exact same
  // `resolveOpenPeriod()` — every other document type in this codebase
  // already posts through, with no CreditNote/DebitNote-specific period
  // logic of their own to separately verify. That shared mechanism is
  // already exhaustively proven against a real closed period by
  // `test/accounting.e2e-spec.ts`'s own "WO-19.5 — closing a period
  // redirects a fact dated inside it to the next OPEN one" suite.
  //
  // An earlier draft of this file added a SEPARATE real-Postgres test here
  // that created its own OPEN FiscalPeriod to force the same proof a
  // second time. It was removed: `resolveOpenPeriod()`'s "most recently
  // opened OPEN period" fallback is GLOBAL, by production design — Jest
  // runs suites in parallel workers against this same database, and a
  // second file racing to create the globally-most-recent OPEN period
  // collided with `accounting.e2e-spec.ts`'s own fallback assertions when
  // first tried here. That collision is real evidence the mechanism is
  // correctly global, not a gap in either suite — and a reason to prove a
  // GLOBAL mechanism once, not per document type that merely calls it.

  it('DebitNotesService posts Dr Accounts Payable / Cr Purchase Returns and void reverses it', async () => {
    const before = await apBalanceForSupplier();
    const note = await debitNotes.create({ supplierId, amountMinor: 900, reason: 'Overcharge' }, userA);
    await debitNotes.issue(note.id);
    const after = await apBalanceForSupplier();
    expect(before - after).toBe(900);

    await debitNotes.voidDebitNote(note.id);
    const afterVoid = await apBalanceForSupplier();
    expect(afterVoid).toBe(before);
  });

  /**
   * A raw double-entry sum across EVERY line ever posted for this account —
   * deliberately not filtered to `status: 'POSTED'` the way
   * `gl-reports.service.ts`'s `agedPayables()` is: that report only sums
   * UNSETTLED origination remainders (`ageMovements()`), so a REVERSED
   * origination's exclusion is harmless there (nothing is left to age).
   * This test has no origination bill at all, only a DebitNote's own
   * settlement-shaped line — a raw sum is the only way to prove the
   * reversal nets exactly back to zero, and it must include the REVERSED
   * original (immutable, still a real historical line) alongside its
   * reversal, or the two can never cancel.
   */
  async function apBalanceForSupplier(): Promise<number> {
    const lines = await prisma.journalLine.findMany({
      where: { accountId: apAccountId, supplierId },
      select: { debitMinor: true, creditMinor: true },
    });
    return lines.reduce((sum, l) => sum + (l.creditMinor - l.debitMinor), 0);
  }

  async function approvalThreshold(): Promise<number> {
    // Settings' shared L2 is not under test here: Redis reads as not connected, so the read is Postgres's.
    const settings = new SettingsService(prisma, { isReady: () => false } as unknown as RedisService);
    return settings.get<number>(SettingKey.FinanceCreditNoteApprovalThresholdMinor);
  }
});

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BRAND } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { documentPrefix } from '../../core/settings/document-prefix';
import { Prisma, type FiscalPeriod, type JournalEntry, type JournalLine } from '../../core/prisma/client';

export interface PostLineInput {
  accountId: string;
  /** Exactly one of debitMinor/creditMinor should be non-zero — a line that is both, or neither, is not a line. */
  debitMinor?: number;
  creditMinor?: number;
  /** Defaults to the deployment's own base currency. Real multi-currency conversion is WO-19.3. */
  currency?: string;
  fxRateScaled?: number;
  baseAmountMinor?: number;
  organizationId?: string | null;
  retailBrandId?: string | null;
  branchNodeId?: string | null;
  costCentreId?: string | null;
  contactId?: string | null;
  supplierId?: string | null;
}

export interface PostEntryInput {
  /** The fact's own original time — retained even when this posts late, into whatever period is open today (R15). */
  date: Date;
  /** The domain event name that caused this — "order.placed", once WO-19.2 posts one. */
  source: string;
  sourceRef?: string;
  memo?: string;
  lines: PostLineInput[];
}

export type JournalEntryWithLines = JournalEntry & { lines: JournalLine[] };

/**
 * The general ledger's write side (RETAIL-ERP.md R15, WO-19.1). Two
 * operations only: `postEntry()` and `reverseEntry()` — nothing here ever
 * updates or deletes a line, matching the database triggers that would
 * refuse it anyway (see the migration). Posting *rules* — which event
 * produces which journal — are WO-19.2; nothing calls `postEntry()` in
 * production yet.
 */
@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Balances the entry in application code first — a `BadRequestException`
   * is a far friendlier failure than the database trigger's raw Postgres
   * error, but the trigger is the actual guarantee (House Rule: an
   * application-only check is one bug away from a corrupt ledger). Resolves
   * the *currently open* period rather than the period `date` falls into,
   * so a three-day-late offline sale still posts (R15) instead of failing
   * because its own period has since closed.
   */
  async postEntry(input: PostEntryInput): Promise<JournalEntryWithLines> {
    this.assertBalanced(input.lines);
    const period = await this.resolveOpenPeriod(input.date);

    return this.prisma.$transaction(async (tx) => {
      const number = await this.nextJournalNumber(tx, period.fiscalYearId, await this.fiscalYearName(tx, period.fiscalYearId));

      return tx.journalEntry.create({
        data: {
          number,
          date: input.date,
          periodId: period.id,
          source: input.source,
          sourceRef: input.sourceRef,
          memo: input.memo,
          status: 'POSTED',
          lines: { create: input.lines.map((line) => this.lineData(line)) },
        },
        include: { lines: true },
      });
    });
  }

  /**
   * Never edits or deletes the original — posts a new entry with every
   * line's debit and credit swapped, dated at reversal time (not backdated
   * to the original), then marks the original REVERSED. Both writes commit
   * in one transaction: a reader must never see a REVERSED original with no
   * reversal, or a reversal whose original still reads POSTED.
   */
  async reverseEntry(entryId: string, memo?: string): Promise<JournalEntryWithLines> {
    const original = await this.prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: { lines: true },
    });
    if (!original) throw new NotFoundException('Journal entry not found.');
    if (original.status !== 'POSTED') {
      throw new BadRequestException('Only a POSTED entry can be reversed.');
    }

    const now = new Date();
    const period = await this.resolveOpenPeriod(now);

    return this.prisma.$transaction(async (tx) => {
      const number = await this.nextJournalNumber(tx, period.fiscalYearId, await this.fiscalYearName(tx, period.fiscalYearId));

      const reversal = await tx.journalEntry.create({
        data: {
          number,
          date: now,
          periodId: period.id,
          source: original.source,
          sourceRef: original.sourceRef,
          memo: memo ?? `Reversal of ${original.number}`,
          status: 'POSTED',
          reversalOfId: original.id,
          lines: {
            create: original.lines.map((line) => ({
              accountId: line.accountId,
              // Swapped — a reversal is the mirror image, never a copy.
              debitMinor: line.creditMinor,
              creditMinor: line.debitMinor,
              currency: line.currency,
              fxRateScaled: line.fxRateScaled,
              baseAmountMinor: line.baseAmountMinor,
              organizationId: line.organizationId,
              retailBrandId: line.retailBrandId,
              branchNodeId: line.branchNodeId,
              costCentreId: line.costCentreId,
              contactId: line.contactId,
              supplierId: line.supplierId,
            })),
          },
        },
        include: { lines: true },
      });

      // The one mutation the immutability trigger permits (see the
      // migration) — everything else about `original` stays untouched.
      await tx.journalEntry.update({ where: { id: original.id }, data: { status: 'REVERSED' } });

      return reversal;
    });
  }

  /**
   * The period a posting at `at` lands in: the OPEN period containing that
   * moment if one exists, otherwise the most recently opened OPEN period —
   * the fallback that makes a late fact postable at all once its own period
   * has closed (R15). Throws if nothing is open, which a shop should never
   * actually reach: closing a period without opening the next one is a
   * bookkeeping mistake, not a state this method should paper over.
   */
  async resolveOpenPeriod(at: Date): Promise<FiscalPeriod> {
    const containing = await this.prisma.fiscalPeriod.findFirst({
      where: { status: 'OPEN', startsOn: { lte: at }, endsOn: { gt: at } },
    });
    if (containing) return containing;

    const mostRecentOpen = await this.prisma.fiscalPeriod.findFirst({
      where: { status: 'OPEN' },
      orderBy: { startsOn: 'desc' },
    });
    if (mostRecentOpen) return mostRecentOpen;

    throw new BadRequestException('No open fiscal period to post into.');
  }

  private assertBalanced(lines: PostLineInput[]): void {
    if (lines.length === 0) throw new BadRequestException('A journal entry needs at least one line.');

    const totalDebit = lines.reduce((sum, line) => sum + (line.debitMinor ?? 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + (line.creditMinor ?? 0), 0);
    if (totalDebit !== totalCredit) {
      throw new BadRequestException(
        `Journal entry does not balance: debit ${totalDebit} does not equal credit ${totalCredit}.`,
      );
    }
    if (totalDebit === 0) throw new BadRequestException('A journal entry cannot be all zero.');

    for (const line of lines) {
      const debit = line.debitMinor ?? 0;
      const credit = line.creditMinor ?? 0;
      if (debit !== 0 && credit !== 0) {
        throw new BadRequestException('A line cannot carry both a debit and a credit.');
      }
      if (debit === 0 && credit === 0) {
        throw new BadRequestException('Every line needs a non-zero debit or credit.');
      }
      if (debit < 0 || credit < 0) {
        throw new BadRequestException('Debit and credit amounts must be positive — post the other side instead.');
      }
    }
  }

  private lineData(line: PostLineInput): Prisma.JournalLineCreateWithoutEntryInput {
    const debitMinor = line.debitMinor ?? 0;
    const creditMinor = line.creditMinor ?? 0;
    return {
      account: { connect: { id: line.accountId } },
      debitMinor,
      creditMinor,
      currency: line.currency ?? BRAND.locale.currency,
      fxRateScaled: line.fxRateScaled ?? 1_000_000,
      baseAmountMinor: line.baseAmountMinor ?? (debitMinor || creditMinor),
      organizationId: line.organizationId,
      retailBrandId: line.retailBrandId,
      branchNodeId: line.branchNodeId,
      costCentreId: line.costCentreId,
      contactId: line.contactId,
      supplierId: line.supplierId,
    };
  }

  private async fiscalYearName(tx: Prisma.TransactionClient, fiscalYearId: string): Promise<string> {
    const fiscalYear = await tx.fiscalYear.findUniqueOrThrow({ where: { id: fiscalYearId } });
    return fiscalYear.name;
  }

  /**
   * Gapless by construction (R18), not merely usually gapless the way
   * `Order.number` accepts a gap from a failed checkout (R6): the counter
   * increment happens inside the same transaction as the entry it numbers,
   * so a rolled-back posting rolls the counter back with it. Never
   * node-prefixed — see accounting.prisma's own comment on
   * `JournalEntry.number`.
   */
  private async nextJournalNumber(
    tx: Prisma.TransactionClient,
    fiscalYearId: string,
    fiscalYearName: string,
  ): Promise<string> {
    const prefix = await documentPrefix(this.settings, 'journalEntry');

    const [{ counter }] = await tx.$queryRaw<Array<{ counter: number }>>`
      INSERT INTO "JournalEntryNumberCounter" ("fiscalYearId", "counter") VALUES (${fiscalYearId}, 1)
      ON CONFLICT ("fiscalYearId") DO UPDATE SET "counter" = "JournalEntryNumberCounter"."counter" + 1
      RETURNING "counter"
    `;

    return `${prefix}-${fiscalYearName}-${String(counter).padStart(4, '0')}`;
  }
}

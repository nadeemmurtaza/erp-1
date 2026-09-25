import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import type { Prisma } from '../../core/prisma/client';

export interface CreditNoteInput {
  merchantPayableId: string;
  /** Positive — the amount to correct the payable down by. */
  amountMinor: number;
  reason: string;
  actorId: string;
}

export interface CreditNoteResult {
  /** The correction's own record id, for audit and idempotency. */
  id: string;
  /** Whether the correction actually reduced the payable, or (already-PAID) only recorded the amount owed back. */
  applied: 'REDUCED_PAYABLE' | 'RECORDED_AS_OWED_BACK';
}

/**
 * `WalletService.refund()`'s own port for correcting a `MerchantPayable`
 * that a wallet credit REDEEM already created, when doc 145's own
 * `CreditNote`/`DebitNote` mechanism does not exist in this checkout yet
 * (doc 155 §3: "reused here rather than invented twice" — the mechanism
 * this port exists to be swapped for, the day it lands).
 *
 * `apps/api/prisma/schema/invoicing.prisma` had no `CreditNote` model when
 * this module was built (checked directly — see wallet.module.ts's own
 * comment). `MerchantPayableAdjustmentCreditNoteService` below is the
 * interim, accounting-equivalent default: it does the correct thing today
 * (reduces the payable before payout, or records the amount owed back once
 * already paid — "the undo fan-out" lens's own answer), never silently
 * nothing and never a throw. Replace the binding in `wallet.module.ts` with
 * a `CreditNote`-backed implementation once doc 145 ships, and delete this
 * file's default — the port interface itself does not need to change.
 */
export interface CreditNoteService {
  issueForMerchantPayable(
    input: CreditNoteInput,
    tx?: Prisma.TransactionClient,
  ): Promise<CreditNoteResult>;
}

export const CREDIT_NOTE_SERVICE = Symbol('CREDIT_NOTE_SERVICE');

@Injectable()
export class MerchantPayableAdjustmentCreditNoteService implements CreditNoteService {
  private readonly logger = new Logger(MerchantPayableAdjustmentCreditNoteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async issueForMerchantPayable(
    input: CreditNoteInput,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<CreditNoteResult> {
    const payable = await tx.merchantPayable.findUniqueOrThrow({ where: { id: input.merchantPayableId } });

    if (payable.status !== 'PAID') {
      // Not yet paid out — an ordinary reduction of what Newax still owes,
      // the accounting-equivalent of a CreditNote applied before settlement.
      // Floors at 0 rather than going negative; any amount beyond the
      // remaining payable is out of scope for this default (a real
      // CreditNote would carry the excess forward against a future order —
      // this interim implementation does not invent that).
      const reduceBy = Math.min(input.amountMinor, payable.netPayableMinor);
      await tx.merchantPayable.update({
        where: { id: input.merchantPayableId },
        data: {
          netPayableMinor: { decrement: reduceBy },
          grossMinor: { decrement: reduceBy },
        },
      });
      await this.audit.record({
        actorId: input.actorId,
        action: 'wallet.merchant_payable_credit_note_applied',
        entity: 'MerchantPayable',
        entityId: input.merchantPayableId,
        data: { amountMinor: reduceBy, reason: input.reason, appliedBefore: 'PAYOUT' },
      });
      return { id: `${input.merchantPayableId}:${Date.now()}`, applied: 'REDUCED_PAYABLE' };
    }

    // Already PAID — real bank money already sent. "The undo fan-out"
    // lens's own answer: this does NOT claw back automatically. Recorded
    // here as the amount the merchant now owes back, surfaced through the
    // audit trail today; doc 145's own receivables/dunning mechanism is the
    // named, not-yet-built home for this once it exists (never silently
    // dropped in the meantime).
    this.logger.warn(
      `MerchantPayable ${input.merchantPayableId} is already PAID — recording ${input.amountMinor} owed back rather than clawing back automatically.`,
    );
    await this.audit.record({
      actorId: input.actorId,
      action: 'wallet.merchant_payable_owed_back',
      entity: 'MerchantPayable',
      entityId: input.merchantPayableId,
      data: {
        amountMinor: input.amountMinor,
        reason: input.reason,
        note: 'Already PAID — no automatic clawback. Surface to AR/dunning once doc 145 ships.',
      },
    });
    return { id: `${input.merchantPayableId}:${Date.now()}`, applied: 'RECORDED_AS_OWED_BACK' };
  }
}

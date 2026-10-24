import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../core/prisma/client';
import type { CreditNote, CreditDebitNoteStatus } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { documentPrefix } from '../../../core/settings/document-prefix';
import { documentNumber, documentNumberPrefix } from '../../../core/settings/document-number';
import { AppConfigService } from '../../../core/config/app-config.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { DomainEvent } from '../../../core/events/domain-events';
import { CreateCreditNoteDto, ApplyCreditNoteDto } from './dto/receivables.dto';

const CN_NUMBER_LOCK_NAMESPACE = 8_241_150;

async function nextCreditNoteNumber(
  tx: Prisma.TransactionClient,
  settings: SettingsService,
  config: AppConfigService,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = await documentPrefix(settings, 'creditNote');
  const like = documentNumberPrefix(config, prefix, year);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CN_NUMBER_LOCK_NAMESPACE}::int, ${year}::int)`;
  const [{ max }] = await tx.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(split_part("number", '-', -1) AS INTEGER)) AS max
    FROM "CreditNote"
    WHERE "number" LIKE ${`${like}%`}
  `;
  const nextSequence = (max ?? 0) + 1;
  return documentNumber(config, prefix, year, nextSequence);
}

/**
 * 145-receivables-credit-limits-dunning.md (WO-145.2) — the REQUEST side of
 * a CreditNote: `create()`/`issue()`/`approve()`/`apply()` may each refuse.
 * `voidCreditNote()` reaches an already-ISSUED note, which is a RECORD once
 * posted — void reverses the ledger entry rather than deleting the note.
 */
@Injectable()
export class CreditNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly events: EventBusService,
  ) {}

  async create(dto: CreateCreditNoteDto, actorId: string): Promise<CreditNote> {
    if (dto.amountMinor <= 0) {
      throw new BadRequestException('A credit note needs a positive amount.');
    }
    return this.prisma.$transaction(async (tx) => {
      const number = await nextCreditNoteNumber(tx, this.settings, this.config);
      return tx.creditNote.create({
        data: {
          number,
          customerId: dto.customerId,
          orderId: dto.orderId ?? null,
          amountMinor: dto.amountMinor,
          reason: dto.reason,
          status: 'DRAFT',
          createdById: actorId,
        },
      });
    });
  }

  async findMany(filters: { customerId?: string; status?: CreditDebitNoteStatus } = {}) {
    return this.prisma.creditNote.findMany({
      where: { customerId: filters.customerId, status: filters.status },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<CreditNote> {
    const note = await this.prisma.creditNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Credit note not found.');
    return note;
  }

  /**
   * "The threshold nobody approves alone" — never the creator's own
   * approval, the identical self-approval refusal `requisition.service.ts`
   * already applies (doc 63, doc 145, doc 149).
   */
  async approve(id: string, actorId: string): Promise<CreditNote> {
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.creditNote.findUnique({ where: { id } });
      if (!note) throw new NotFoundException('Credit note not found.');
      if (note.createdById === actorId) {
        throw new ForbiddenException('The creator of a credit note cannot approve their own.');
      }
      if (note.status !== 'DRAFT') {
        throw new ConflictException(`This credit note is already ${note.status}.`);
      }
      return tx.creditNote.update({ where: { id }, data: { approvedById: actorId } });
    });
  }

  /**
   * A DRAFT note at or below the configured threshold issues straight
   * through; above it, `approve()` must already have run, by someone other
   * than `createdById` — enforced again here, never trusted from the
   * approval step alone, so a threshold lowered after approval cannot be
   * bypassed by a stale approvedById.
   */
  async issue(id: string, actorId: string): Promise<CreditNote> {
    const threshold = await this.settings.get<number>(SettingKey.FinanceCreditNoteApprovalThresholdMinor);

    return this.prisma.$transaction(async (tx) => {
      const note = await tx.creditNote.findUnique({ where: { id } });
      if (!note) throw new NotFoundException('Credit note not found.');
      if (note.status !== 'DRAFT') {
        throw new ConflictException(`This credit note is already ${note.status}.`);
      }
      if (note.amountMinor > threshold) {
        if (!note.approvedById) {
          throw new ForbiddenException(`A credit note over ${threshold} paisa needs finance.credit-notes.approve before it can be issued.`);
        }
        if (note.approvedById === actorId && note.createdById === actorId) {
          throw new ForbiddenException('The creator of a credit note cannot approve or issue their own above-threshold note alone.');
        }
      }

      const issuedAt = new Date();
      const issued = await tx.creditNote.update({ where: { id }, data: { status: 'ISSUED', issuedAt } });

      await this.events.publish(
        DomainEvent.CreditNoteIssued,
        {
          creditNoteId: issued.id,
          customerId: issued.customerId,
          orderId: issued.orderId,
          amountMinor: issued.amountMinor,
          issuedAt: issuedAt.toISOString(),
        },
        tx,
      );

      return issued;
    });
  }

  /** Applies an already-ISSUED note's balance to a DIFFERENT open order than the one it originally cited — never a second posting, only a change of which order the credit is recorded against. */
  async apply(id: string, dto: ApplyCreditNoteDto): Promise<CreditNote> {
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.creditNote.findUnique({ where: { id } });
      if (!note) throw new NotFoundException('Credit note not found.');
      if (note.status !== 'ISSUED') {
        throw new ConflictException('Only an ISSUED credit note can be applied to an order.');
      }
      return tx.creditNote.update({
        where: { id },
        data: { status: 'APPLIED', appliedToOrderId: dto.orderId },
      });
    });
  }

  /**
   * "The reversal document, not the reversal flag" — void reverses the
   * ledger entry `issue()` posted (via CreditNoteVoided), it never deletes
   * or mutates the note's own amount. A DRAFT note (never posted) simply
   * moves to VOID with nothing to reverse.
   */
  async voidCreditNote(id: string, reason?: string): Promise<CreditNote> {
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.creditNote.findUnique({ where: { id } });
      if (!note) throw new NotFoundException('Credit note not found.');
      if (note.status === 'VOID') {
        throw new ConflictException('This credit note is already void.');
      }
      const wasIssued = note.status === 'ISSUED' || note.status === 'APPLIED';

      const voided = await tx.creditNote.update({
        where: { id },
        data: { status: 'VOID', voidedAt: new Date(), reason: reason?.trim() ? `${note.reason} — voided: ${reason.trim()}` : note.reason },
      });

      if (wasIssued) {
        await this.events.publish(DomainEvent.CreditNoteVoided, { creditNoteId: voided.id }, tx);
      }

      return voided;
    });
  }
}

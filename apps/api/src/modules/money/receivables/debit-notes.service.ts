import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../core/prisma/client';
import type { DebitNote, CreditDebitNoteStatus } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { documentPrefix } from '../../../core/settings/document-prefix';
import { documentNumber, documentNumberPrefix } from '../../../core/settings/document-number';
import { AppConfigService } from '../../../core/config/app-config.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { DomainEvent } from '../../../core/events/domain-events';
import { CreateDebitNoteDto } from './dto/receivables.dto';

const DN_NUMBER_LOCK_NAMESPACE = 8_241_151;

async function nextDebitNoteNumber(
  tx: Prisma.TransactionClient,
  settings: SettingsService,
  config: AppConfigService,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = await documentPrefix(settings, 'debitNote');
  const like = documentNumberPrefix(config, prefix, year);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DN_NUMBER_LOCK_NAMESPACE}::int, ${year}::int)`;
  const [{ max }] = await tx.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(split_part("number", '-', -1) AS INTEGER)) AS max
    FROM "DebitNote"
    WHERE "number" LIKE ${`${like}%`}
  `;
  const nextSequence = (max ?? 0) + 1;
  return documentNumber(config, prefix, year, nextSequence);
}

/**
 * 145-receivables-credit-limits-dunning.md (WO-145.2) — the AP-side mirror
 * of CreditNotesService. No approval threshold: the doc names one for
 * CreditNote only ("a way to make money disappear from what a customer
 * owes"); a DebitNote reduces what THIS org owes, the opposite exposure.
 */
@Injectable()
export class DebitNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly events: EventBusService,
  ) {}

  async create(dto: CreateDebitNoteDto, actorId: string): Promise<DebitNote> {
    if (dto.amountMinor <= 0) {
      throw new BadRequestException('A debit note needs a positive amount.');
    }
    return this.prisma.$transaction(async (tx) => {
      const number = await nextDebitNoteNumber(tx, this.settings, this.config);
      return tx.debitNote.create({
        data: {
          number,
          supplierId: dto.supplierId,
          supplierBillId: dto.supplierBillId ?? null,
          amountMinor: dto.amountMinor,
          reason: dto.reason,
          status: 'DRAFT',
          createdById: actorId,
        },
      });
    });
  }

  async findMany(filters: { supplierId?: string; status?: CreditDebitNoteStatus } = {}) {
    return this.prisma.debitNote.findMany({
      where: { supplierId: filters.supplierId, status: filters.status },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<DebitNote> {
    const note = await this.prisma.debitNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Debit note not found.');
    return note;
  }

  async issue(id: string): Promise<DebitNote> {
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.debitNote.findUnique({ where: { id } });
      if (!note) throw new NotFoundException('Debit note not found.');
      if (note.status !== 'DRAFT') {
        throw new ConflictException(`This debit note is already ${note.status}.`);
      }

      const issuedAt = new Date();
      const issued = await tx.debitNote.update({ where: { id }, data: { status: 'ISSUED', issuedAt } });

      await this.events.publish(
        DomainEvent.DebitNoteIssued,
        {
          debitNoteId: issued.id,
          supplierId: issued.supplierId,
          supplierBillId: issued.supplierBillId,
          amountMinor: issued.amountMinor,
          issuedAt: issuedAt.toISOString(),
        },
        tx,
      );

      return issued;
    });
  }

  async voidDebitNote(id: string, reason?: string): Promise<DebitNote> {
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.debitNote.findUnique({ where: { id } });
      if (!note) throw new NotFoundException('Debit note not found.');
      if (note.status === 'VOID') {
        throw new ConflictException('This debit note is already void.');
      }
      const wasIssued = note.status === 'ISSUED';

      const voided = await tx.debitNote.update({
        where: { id },
        data: { status: 'VOID', voidedAt: new Date(), reason: reason?.trim() ? `${note.reason} — voided: ${reason.trim()}` : note.reason },
      });

      if (wasIssued) {
        await this.events.publish(DomainEvent.DebitNoteVoided, { debitNoteId: voided.id }, tx);
      }

      return voided;
    });
  }
}

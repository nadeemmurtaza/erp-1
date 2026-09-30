import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DomainEvent } from '../../../core/events/domain-events';
import { EventBusService } from '../../../core/events/event-bus.service';
import { Prisma } from '../../../core/prisma/client';
import type { PartnerFactStatus, TradingPartner } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { PartnerFactType, SubmitPartnerFactDto } from './dto/partner-fact.dto';

/** What the partner is told. `duplicate: true` means we already had this exact fact. */
export interface PartnerFactReceipt {
  factId: string;
  status: PartnerFactStatus;
  duplicate: boolean;
}

/**
 * A key-sorted JSON string, so two senders that list the same fields in a
 * different order produce the same hash. Only plain JSON (objects, arrays,
 * strings, numbers, booleans) ever reaches this.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashFact(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * "Store first, apply second" (WO-213.1, 213-partner-fact-exchange.md,
 * ADR-083). Receiving a partner's fact writes one `PartnerFactInbox` row and
 * queues `PartnerFactReceived` in the SAME transaction, then answers. That
 * makes acknowledging a fact mean "stored", never "applied": a slow, broken or
 * absent `purchasing` module cannot make a partner's delivery fail, and the
 * partner's 72-hour retry can never lose a fact or apply it twice.
 *
 * This service imports no other feature module. The effect of a fact (a
 * purchase order, for `sale.dispatched`) belongs to whichever module
 * subscribes to `PartnerFactReceived`.
 *
 * Failure paths: an unknown fact type or malformed body is refused before
 * anything is written (400, by the DTO and `assertFactShape`); a partner
 * whose `kind` may not send this type is refused (403); the same `factId`
 * again is answered from the stored row (idempotent, including two requests
 * racing each other, which the unique constraint decides); the same `factId`
 * with different content is refused (409) rather than silently replayed.
 */
@Injectable()
export class PartnerFactInboxService {
  private readonly logger = new Logger(PartnerFactInboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  async accept(partner: TradingPartner, dto: SubmitPartnerFactDto): Promise<PartnerFactReceipt> {
    this.assertPartnerMaySend(partner, dto.type);
    this.assertFactShape(dto);

    // The validated DTO, as plain JSON: fields the sender added beyond the
    // contract were already stripped (whitelist), so nothing unbounded is stored.
    const payload = JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonObject;
    const payloadHash = hashFact(payload);

    try {
      const stored = await this.prisma.$transaction(async (tx) => {
        const row = await tx.partnerFactInbox.create({
          data: {
            tradingPartnerId: partner.id,
            factId: dto.factId,
            type: dto.type,
            schemaVersion: dto.schemaVersion,
            documentRef: dto.documentRef ?? null,
            occurredAt: new Date(dto.occurredAt),
            payloadHash,
            payload,
          },
          select: { id: true, status: true },
        });
        await this.eventBus.publish(
          DomainEvent.PartnerFactReceived,
          {
            inboxId: row.id,
            tradingPartnerId: partner.id,
            factId: dto.factId,
            type: dto.type,
          },
          tx,
        );
        return row;
      });

      this.logger.log(
        `partner fact stored: partner=${partner.id} type=${dto.type} factId=${dto.factId} lines=${dto.lines.length}`,
      );
      return { factId: dto.factId, status: stored.status, duplicate: false };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return this.answerRepeat(partner.id, dto.factId, payloadHash);
    }
  }

  /** The same factId arrived again: answer from what we stored, or refuse if the content changed. */
  private async answerRepeat(
    tradingPartnerId: string,
    factId: string,
    payloadHash: string,
  ): Promise<PartnerFactReceipt> {
    const existing = await this.prisma.partnerFactInbox.findUnique({
      where: { tradingPartnerId_factId: { tradingPartnerId, factId } },
      select: { status: true, payloadHash: true },
    });
    if (!existing) {
      // The unique violation said the row exists; it vanished between the two
      // statements. Surface it rather than guess — the sender will retry.
      throw new ConflictException('This fact could not be stored; retry it unchanged.');
    }
    if (existing.payloadHash !== payloadHash) {
      this.logger.warn(
        `partner fact refused: partner=${tradingPartnerId} factId=${factId} reused with different content`,
      );
      throw new ConflictException(
        'This factId was already received with different content. A fact is never edited: send a correction as a new fact with a new factId.',
      );
    }
    return { factId, status: existing.status, duplicate: true };
  }

  /** A supplier tells us what it sold us; a customer tells us what it received. Anyone else sending either is a mistake or an attack. */
  private assertPartnerMaySend(partner: TradingPartner, type: PartnerFactType): void {
    const allowed: Record<PartnerFactType, ReadonlyArray<TradingPartner['kind']>> = {
      'sale.dispatched': ['SUPPLIER', 'BOTH'],
      'receipt.confirmed': ['CUSTOMER', 'BOTH'],
    };
    if (!allowed[type].includes(partner.kind)) {
      throw new ForbiddenException(`A ${partner.kind} trading partner may not send a "${type}" fact.`);
    }
  }

  /**
   * The per-type rules class-validator cannot express across sibling
   * properties. Pure: no database, no event — it is also what a dry run of a
   * stored fact would call.
   */
  assertFactShape(dto: SubmitPartnerFactDto): void {
    const fail = (message: string): never => {
      throw new BadRequestException(message);
    };

    if (dto.type === 'sale.dispatched') {
      if (!dto.currency) fail('A sale.dispatched fact needs a currency.');
      if (dto.inReplyToFactId) fail('A sale.dispatched fact cannot reply to another fact.');
      dto.lines.forEach((line, i) => {
        const at = `lines[${i}]`;
        if (!line.gtin && !line.sellerSku) fail(`${at} needs a gtin or a sellerSku.`);
        if (!line.name) fail(`${at} needs a name.`);
        if (line.quantity === undefined) fail(`${at} needs a quantity.`);
        if (line.unitPriceMinor === undefined) fail(`${at} needs a unitPriceMinor.`);
        if (line.quantityDelivered !== undefined) fail(`${at}: quantityDelivered belongs on a receipt.confirmed fact.`);
      });
      return;
    }

    // receipt.confirmed
    if (!dto.inReplyToFactId) fail('A receipt.confirmed fact needs inReplyToFactId.');
    if (dto.currency) fail('A receipt.confirmed fact carries no prices, so no currency.');
    dto.lines.forEach((line, i) => {
      const at = `lines[${i}]`;
      if (!line.gtin && !line.sellerSku) fail(`${at} needs a gtin or a sellerSku.`);
      if (line.quantityDelivered === undefined) fail(`${at} needs quantityDelivered.`);
      if (line.quantity !== undefined || line.unitPriceMinor !== undefined || line.taxMinor !== undefined) {
        fail(`${at}: a receipt.confirmed line carries quantityDelivered only.`);
      }
    });
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { EventBusService } from '../../../core/events/event-bus.service';
import { DomainEvent } from '../../../core/events/domain-events';
import { AuditService } from '../../../core/audit/audit.service';
import type { SettlementBatch, SettlementBatchStatus } from '../../../core/prisma/client';
import type { FinancialInstitutionConnector } from './settlement-connector';
import { CreateExpectedBatchDto } from './dto/settlement.dto';

/**
 * `SettlementBatch` is a reconciliation target, not a payment record —
 * what a bank or gateway says it actually paid out, compared against what
 * `Payment` already records as owed (finance-accounting/
 * 49-financial-institution-settlement-partnerships.md). No real
 * `FinancialInstitutionConnector` exists yet (`this.connectors` is
 * permanently empty until one is added to this constructor's own list —
 * settlement-connector.ts's own doc), so `reconcile()` and the polling
 * cron have nothing to reconcile against today; `createExpectedBatch()`
 * still works without one — an admin recording which payments a bank
 * round-up should cover is a real, connector-independent operational need.
 */
@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);
  private readonly connectors = new Map<string, FinancialInstitutionConnector>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
  ) {
    // No concrete FinancialInstitutionConnector class exists in this
    // codebase yet — the list below is where one is added, the identical
    // shape PaymentsService's own provider list already uses.
    for (const connector of [] as FinancialInstitutionConnector[]) {
      this.connectors.set(connector.institution, connector);
    }
  }

  async listProviders() {
    return this.prisma.settlementProvider.findMany({ orderBy: { label: 'asc' } });
  }

  async listBatches(status?: SettlementBatchStatus) {
    return this.prisma.settlementBatch.findMany({
      where: status ? { status } : undefined,
      include: { provider: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getBatch(id: string) {
    const batch = await this.prisma.settlementBatch.findUnique({
      where: { id },
      include: { provider: true, lines: { include: { payment: true } } },
    });
    if (!batch) throw new NotFoundException('Settlement batch not found.');
    return batch;
  }

  /**
   * Which of our own Payment rows this batch is meant to cover, computed
   * from the payments named — never invented, never guessed from a date
   * range.
   */
  async createExpectedBatch(dto: CreateExpectedBatchDto): Promise<SettlementBatch> {
    const provider = await this.prisma.settlementProvider.findUnique({ where: { id: dto.settlementProviderId } });
    if (!provider) throw new NotFoundException('Settlement provider not found.');

    const payments = await this.prisma.payment.findMany({ where: { id: { in: dto.paymentIds } } });
    if (payments.length !== dto.paymentIds.length) {
      throw new BadRequestException('One or more payments were not found.');
    }

    const existing = await this.prisma.settlementBatch.findUnique({
      where: { settlementProviderId_externalBatchRef: { settlementProviderId: dto.settlementProviderId, externalBatchRef: dto.externalBatchRef } },
    });
    if (existing) throw new ConflictException(`Batch ${dto.externalBatchRef} already exists for this provider.`);

    const expectedAmountMinor = payments.reduce((sum, p) => sum + p.amount, 0);

    return this.prisma.settlementBatch.create({
      data: {
        settlementProviderId: dto.settlementProviderId,
        externalBatchRef: dto.externalBatchRef,
        expectedAmountMinor,
        lines: { create: payments.map((p) => ({ paymentId: p.id, amountMinor: p.amount })) },
      },
    });
  }

  /**
   * Calls the registered connector for this batch's own provider and
   * records exactly what it reports — never the caller's own claim. A
   * `SHORT` classification is never auto-resolved (§3): it surfaces as a
   * named variance for a human to accept (write off) or dispute.
   */
  async reconcile(batchId: string): Promise<SettlementBatch> {
    const batch = await this.prisma.settlementBatch.findUnique({ where: { id: batchId }, include: { provider: true } });
    if (!batch) throw new NotFoundException('Settlement batch not found.');
    if (batch.status !== 'EXPECTED') {
      throw new ConflictException(`This batch is already ${batch.status}.`);
    }

    const connector = this.connectors.get(batch.provider.key);
    if (!connector) {
      throw new BadRequestException(`No settlement connector is registered for ${batch.provider.key}.`);
    }

    const { settledAmountMinor, settledAt } = await connector.reconcileBatch(batch.externalBatchRef);
    const status: SettlementBatchStatus = settledAmountMinor < batch.expectedAmountMinor ? 'SHORT' : 'CONFIRMED';

    return this.prisma.settlementBatch.update({
      where: { id: batchId },
      data: { settledAmountMinor, settledAt, status },
    });
  }

  /** WO-49.3's own polling fallback — every EXPECTED batch with a registered connector, reconciled once. Silently does nothing for a batch whose provider has no connector; the batch stays EXPECTED and is picked up again the next tick once one exists. */
  async pollExpectedBatches(): Promise<{ reconciled: number; skipped: number }> {
    const batches = await this.prisma.settlementBatch.findMany({ where: { status: 'EXPECTED' }, include: { provider: true } });

    let reconciled = 0;
    let skipped = 0;
    for (const batch of batches) {
      if (!this.connectors.has(batch.provider.key)) {
        skipped += 1;
        continue;
      }
      try {
        await this.reconcile(batch.id);
        reconciled += 1;
      } catch (cause) {
        this.logger.warn(`Could not reconcile batch ${batch.id}: ${String(cause)}`);
        skipped += 1;
      }
    }
    return { reconciled, skipped };
  }

  /** "The threshold nobody approves alone" — never the requester's own approval, the identical refusal CreditNotesService.approve() already applies. */
  async requestWriteoff(batchId: string, actorId: string, note?: string): Promise<SettlementBatch> {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.settlementBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw new NotFoundException('Settlement batch not found.');
      if (batch.status !== 'SHORT') throw new ConflictException('Only a SHORT batch can request a write-off.');
      if (batch.writtenOffAt) throw new ConflictException('This batch has already been written off.');
      if (batch.writeoffRequestedById) throw new ConflictException('A write-off has already been requested for this batch.');

      return tx.settlementBatch.update({
        where: { id: batchId },
        data: { writeoffRequestedById: actorId, writeoffNote: note },
      });
    });
  }

  async approveWriteoff(batchId: string, actorId: string): Promise<SettlementBatch> {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.settlementBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw new NotFoundException('Settlement batch not found.');
      if (!batch.writeoffRequestedById) {
        throw new BadRequestException('No write-off has been requested for this batch yet.');
      }
      if (batch.writeoffRequestedById === actorId) {
        throw new ForbiddenException('The requester of a write-off cannot approve their own.');
      }
      return tx.settlementBatch.update({ where: { id: batchId }, data: { writeoffApprovedById: actorId } });
    });
  }

  /**
   * Posts Dr expense / Cr the relevant asset account for a SHORT batch's
   * shortfall, through `posting-rules.subscriber.ts`'s own handler —
   * `settlements` never imports `accounting`, publishing
   * `SettlementShortfallWrittenOff` instead, the identical decoupling every
   * other posting rule in this repository already uses. A shortfall at or
   * below the configured threshold posts straight through; above it,
   * requires `approveWriteoff()` to already have run, by someone other than
   * whoever requested it — enforced again here, never trusted from the
   * approval step alone.
   */
  async writeOffShortfall(batchId: string, actorId: string): Promise<SettlementBatch> {
    const threshold = await this.settings.get<number>(SettingKey.FinanceSettlementWriteoffApprovalThresholdMinor);

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.settlementBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw new NotFoundException('Settlement batch not found.');
      if (batch.status !== 'SHORT') throw new ConflictException('Only a SHORT batch can be written off.');
      if (batch.writtenOffAt) throw new ConflictException('This batch has already been written off.');

      const shortfallMinor = batch.expectedAmountMinor - (batch.settledAmountMinor ?? 0);
      if (shortfallMinor > threshold) {
        if (!batch.writeoffApprovedById) {
          throw new ForbiddenException(
            `A shortfall over ${threshold} paisa needs finance.settlement.approve_writeoff before it can be written off.`,
          );
        }
        if (batch.writeoffApprovedById === batch.writeoffRequestedById) {
          throw new ForbiddenException('The requester of a write-off cannot approve their own above-threshold write-off.');
        }
      }

      const writtenOffAt = new Date();
      const updated = await tx.settlementBatch.update({ where: { id: batchId }, data: { writtenOffAt } });

      await this.events.publish(
        DomainEvent.SettlementShortfallWrittenOff,
        { batchId, shortfallMinor, writtenOffAt: writtenOffAt.toISOString() },
        tx,
      );

      await this.recordWriteoffAudit(actorId, batchId, shortfallMinor);
      return updated;
    });
  }

  private async recordWriteoffAudit(actorId: string, batchId: string, shortfallMinor: number): Promise<void> {
    await this.audit.record({
      actorId,
      action: 'settlement.shortfall_written_off',
      entity: 'SettlementBatch',
      entityId: batchId,
      data: { shortfallMinor },
    });
  }
}

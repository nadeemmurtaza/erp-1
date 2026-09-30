import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { AuditService } from '../../../core/audit/audit.service';
import { SettlementsService } from './settlements.service';
import type { FinancialInstitutionConnector } from './settlement-connector';

/**
 * finance-accounting/49-financial-institution-settlement-partnerships.md.
 * No real `FinancialInstitutionConnector` exists in this codebase — the
 * service's own `connectors` map is permanently empty in production. Tests
 * that exercise the reconciled/CONFIRMED/SHORT paths register a fake
 * connector directly into that map (a private field, reached the same way
 * any other white-box unit test reaches private state), proving the
 * mechanism works the moment a real connector is added, without inventing
 * one here.
 */
describe('SettlementsService', () => {
  let service: SettlementsService;
  let prisma: any;
  let settings: any;
  let events: any;
  let audit: any;

  const registerFakeConnector = (connector: FinancialInstitutionConnector) => {
    (service as unknown as { connectors: Map<string, FinancialInstitutionConnector> }).connectors.set(
      connector.institution,
      connector,
    );
  };

  beforeEach(async () => {
    prisma = {
      settlementProvider: { findUnique: jest.fn(), findMany: jest.fn() },
      payment: { findMany: jest.fn() },
      settlementBatch: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    settings = { get: jest.fn().mockResolvedValue(1_000_000) };
    events = { publish: jest.fn() };
    audit = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
        { provide: EventBusService, useValue: events },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(SettlementsService);
  });

  describe('createExpectedBatch', () => {
    const DTO = { settlementProviderId: 'p1', externalBatchRef: 'ref-1', paymentIds: ['pay1', 'pay2'] };

    it('throws NotFoundException for a missing provider', async () => {
      prisma.settlementProvider.findUnique.mockResolvedValue(null);
      await expect(service.createExpectedBatch(DTO)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when a payment id does not resolve', async () => {
      prisma.settlementProvider.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.payment.findMany.mockResolvedValue([{ id: 'pay1', amount: 500 }]); // only 1 of 2
      await expect(service.createExpectedBatch(DTO)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a duplicate (provider, externalBatchRef)', async () => {
      prisma.settlementProvider.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.payment.findMany.mockResolvedValue([
        { id: 'pay1', amount: 500 },
        { id: 'pay2', amount: 300 },
      ]);
      prisma.settlementBatch.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.createExpectedBatch(DTO)).rejects.toBeInstanceOf(ConflictException);
    });

    it('computes expectedAmountMinor as the sum of the named payments', async () => {
      prisma.settlementProvider.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.payment.findMany.mockResolvedValue([
        { id: 'pay1', amount: 500 },
        { id: 'pay2', amount: 300 },
      ]);
      prisma.settlementBatch.findUnique.mockResolvedValue(null);

      await service.createExpectedBatch(DTO);

      expect(prisma.settlementBatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ expectedAmountMinor: 800 }),
        }),
      );
    });
  });

  describe('reconcile', () => {
    const BATCH = { id: 'b1', status: 'EXPECTED', expectedAmountMinor: 1000, externalBatchRef: 'ref-1', provider: { key: 'hbl' } };

    it('throws NotFoundException for a missing batch', async () => {
      prisma.settlementBatch.findUnique.mockResolvedValue(null);
      await expect(service.reconcile('b1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a batch that is not EXPECTED', async () => {
      prisma.settlementBatch.findUnique.mockResolvedValue({ ...BATCH, status: 'CONFIRMED' });
      await expect(service.reconcile('b1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses when no connector is registered for the provider — the real state of this codebase today', async () => {
      prisma.settlementBatch.findUnique.mockResolvedValue(BATCH);
      await expect(service.reconcile('b1')).rejects.toThrow(/no settlement connector/i);
    });

    it('classifies CONFIRMED when the connector reports the full expected amount', async () => {
      prisma.settlementBatch.findUnique.mockResolvedValue(BATCH);
      registerFakeConnector({
        institution: 'hbl',
        reconcileBatch: jest.fn().mockResolvedValue({ settledAmountMinor: 1000, settledAt: new Date('2026-09-25') }),
      });

      await service.reconcile('b1');

      expect(prisma.settlementBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIRMED', settledAmountMinor: 1000 }) }),
      );
    });

    it('classifies SHORT when the connector reports less than expected — never silently CONFIRMED', async () => {
      prisma.settlementBatch.findUnique.mockResolvedValue(BATCH);
      registerFakeConnector({
        institution: 'hbl',
        reconcileBatch: jest.fn().mockResolvedValue({ settledAmountMinor: 900, settledAt: new Date('2026-09-25') }),
      });

      await service.reconcile('b1');

      expect(prisma.settlementBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SHORT', settledAmountMinor: 900 }) }),
      );
    });
  });

  describe('pollExpectedBatches', () => {
    it('skips every batch when no connector is registered — the polling fallback creates nothing on its own', async () => {
      prisma.settlementBatch.findMany.mockResolvedValue([
        { id: 'b1', status: 'EXPECTED', provider: { key: 'hbl' } },
        { id: 'b2', status: 'EXPECTED', provider: { key: 'jazzcash-settlement' } },
      ]);

      const result = await service.pollExpectedBatches();

      expect(result).toEqual({ reconciled: 0, skipped: 2 });
      expect(prisma.settlementBatch.update).not.toHaveBeenCalled();
    });

    it('reconciles a batch whose provider has a registered connector', async () => {
      prisma.settlementBatch.findMany.mockResolvedValue([{ id: 'b1', status: 'EXPECTED', provider: { key: 'hbl' } }]);
      prisma.settlementBatch.findUnique.mockResolvedValue({
        id: 'b1',
        status: 'EXPECTED',
        expectedAmountMinor: 1000,
        externalBatchRef: 'ref-1',
        provider: { key: 'hbl' },
      });
      registerFakeConnector({
        institution: 'hbl',
        reconcileBatch: jest.fn().mockResolvedValue({ settledAmountMinor: 1000, settledAt: new Date() }),
      });

      const result = await service.pollExpectedBatches();

      expect(result).toEqual({ reconciled: 1, skipped: 0 });
    });
  });

  describe('requestWriteoff / approveWriteoff — the maker-checker pair', () => {
    it('refuses to request a write-off for a batch that is not SHORT', async () => {
      prisma.settlementBatch.findUnique.mockResolvedValue({ id: 'b1', status: 'CONFIRMED' });
      await expect(service.requestWriteoff('b1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a second write-off request for the same batch', async () => {
      prisma.settlementBatch.findUnique.mockResolvedValue({ id: 'b1', status: 'SHORT', writeoffRequestedById: 'u1' });
      await expect(service.requestWriteoff('b1', 'u2')).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses the requester approving their own write-off', async () => {
      prisma.settlementBatch.findUnique.mockResolvedValue({ id: 'b1', writeoffRequestedById: 'u1' });
      await expect(service.approveWriteoff('b1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses approving a write-off nobody requested yet', async () => {
      prisma.settlementBatch.findUnique.mockResolvedValue({ id: 'b1', writeoffRequestedById: null });
      await expect(service.approveWriteoff('b1', 'u2')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('approves when a different actor confirms the request', async () => {
      prisma.settlementBatch.findUnique.mockResolvedValue({ id: 'b1', writeoffRequestedById: 'u1' });
      await service.approveWriteoff('b1', 'u2');
      expect(prisma.settlementBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { writeoffApprovedById: 'u2' } }),
      );
    });
  });

  describe('writeOffShortfall', () => {
    const SHORT_BATCH = {
      id: 'b1',
      status: 'SHORT',
      expectedAmountMinor: 1000,
      settledAmountMinor: 700,
      writtenOffAt: null,
      writeoffRequestedById: null,
      writeoffApprovedById: null,
    };

    it('refuses a batch that is not SHORT', async () => {
      prisma.settlementBatch.findUnique.mockResolvedValue({ ...SHORT_BATCH, status: 'CONFIRMED' });
      await expect(service.writeOffShortfall('b1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a batch already written off', async () => {
      prisma.settlementBatch.findUnique.mockResolvedValue({ ...SHORT_BATCH, writtenOffAt: new Date() });
      await expect(service.writeOffShortfall('b1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('posts straight through — no approval needed — when the shortfall is at or below the threshold', async () => {
      settings.get.mockResolvedValue(1000); // shortfall is 300, well under
      prisma.settlementBatch.findUnique.mockResolvedValue(SHORT_BATCH);

      await service.writeOffShortfall('b1', 'u1');

      expect(events.publish).toHaveBeenCalledWith(
        'settlement.shortfall_written_off',
        expect.objectContaining({ batchId: 'b1', shortfallMinor: 300 }),
        prisma,
      );
    });

    it('refuses above the threshold with no approval at all', async () => {
      settings.get.mockResolvedValue(100); // shortfall (300) exceeds this
      prisma.settlementBatch.findUnique.mockResolvedValue(SHORT_BATCH);

      await expect(service.writeOffShortfall('b1', 'u1')).rejects.toThrow(/approve_writeoff/);
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('refuses above the threshold when the approver is the same as the requester', async () => {
      settings.get.mockResolvedValue(100);
      prisma.settlementBatch.findUnique.mockResolvedValue({
        ...SHORT_BATCH,
        writeoffRequestedById: 'u1',
        writeoffApprovedById: 'u1',
      });

      await expect(service.writeOffShortfall('b1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('posts above the threshold once a different actor has approved', async () => {
      settings.get.mockResolvedValue(100);
      prisma.settlementBatch.findUnique.mockResolvedValue({
        ...SHORT_BATCH,
        writeoffRequestedById: 'u1',
        writeoffApprovedById: 'u2',
      });

      await service.writeOffShortfall('b1', 'u1');

      expect(events.publish).toHaveBeenCalledWith(
        'settlement.shortfall_written_off',
        expect.objectContaining({ shortfallMinor: 300 }),
        prisma,
      );
    });
  });
});

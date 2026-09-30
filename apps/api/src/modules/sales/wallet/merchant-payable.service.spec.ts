import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MerchantPayableService } from './merchant-payable.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { IdentityVerificationStatusRegistry } from '../../../core/extension-points/identity-verification-status.registry';

describe('MerchantPayableService — 155-wallet-stored-value-merchant-escrow.md §3', () => {
  let service: MerchantPayableService;
  let prisma: any;
  let audit: any;
  let events: any;
  let identityVerification: any;

  beforeEach(() => {
    prisma = {
      merchantPayable: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
      order: { findMany: jest.fn() },
    };
    audit = { record: jest.fn() };
    events = { publish: jest.fn() };
    identityVerification = { isApproved: jest.fn() };

    service = new MerchantPayableService(
      prisma as PrismaService,
      audit as AuditService,
      events as EventBusService,
      identityVerification as IdentityVerificationStatusRegistry,
    );
  });

  describe('createMerchantPayable', () => {
    it('computes the platform fee and net payable', async () => {
      prisma.merchantPayable.findUnique.mockResolvedValue(null);
      prisma.merchantPayable.create.mockResolvedValue({ id: 'payable1', netPayableMinor: 9_700 });

      await service.createMerchantPayable('order1', 10_000, 'merchantOrg1', 300);

      expect(prisma.merchantPayable.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: 'merchantOrg1', orderId: 'order1', grossMinor: 10_000, platformFeeMinor: 300, netPayableMinor: 9_700 }),
        }),
      );
    });

    it('is idempotent on a retried call for the same orderId', async () => {
      const existing = { id: 'payable1', orderId: 'order1' };
      prisma.merchantPayable.findUnique.mockResolvedValue(existing);

      const result = await service.createMerchantPayable('order1', 10_000, 'merchantOrg1', 300);
      expect(result).toBe(existing);
      expect(prisma.merchantPayable.create).not.toHaveBeenCalled();
    });
  });

  describe('schedulePayoutRun — verified vs unverified timing', () => {
    it('schedules every OPEN payable immediately for a verified merchant', async () => {
      identityVerification.isApproved.mockResolvedValue(true);
      prisma.merchantPayable.findMany.mockResolvedValue([
        { id: 'p1', orderId: 'order1' },
        { id: 'p2', orderId: 'order2' },
      ]);
      prisma.merchantPayable.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.schedulePayoutRun('merchantOrg1', 'owner1');

      expect(result.verified).toBe(true);
      expect(result.scheduledCount).toBe(2);
      expect(prisma.merchantPayable.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['p1', 'p2'] }, status: 'OPEN' } }),
      );
      // Never asked Order about delivery status for a verified merchant.
      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });

    it('an UNVERIFIED merchant only gets payables whose order is DELIVERED scheduled', async () => {
      identityVerification.isApproved.mockResolvedValue(false);
      prisma.merchantPayable.findMany.mockResolvedValue([
        { id: 'p1', orderId: 'order1' },
        { id: 'p2', orderId: 'order2' },
      ]);
      prisma.order.findMany.mockResolvedValue([
        { id: 'order1', status: 'DELIVERED' },
        { id: 'order2', status: 'SHIPPED' },
      ]);
      prisma.merchantPayable.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.schedulePayoutRun('merchantOrg1', 'owner1');

      expect(result.verified).toBe(false);
      expect(result.scheduledCount).toBe(1);
      expect(prisma.merchantPayable.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['p1'] }, status: 'OPEN' } }),
      );
    });

    it('an unverified merchant with no DELIVERED orders schedules nothing', async () => {
      identityVerification.isApproved.mockResolvedValue(false);
      prisma.merchantPayable.findMany.mockResolvedValue([{ id: 'p1', orderId: 'order1' }]);
      prisma.order.findMany.mockResolvedValue([{ id: 'order1', status: 'SHIPPED' }]);

      const result = await service.schedulePayoutRun('merchantOrg1', 'owner1');

      expect(result.scheduledCount).toBe(0);
      expect(prisma.merchantPayable.updateMany).not.toHaveBeenCalled();
    });

    it('defaults to unverified — no identity-verification provider registered — when the module is off', async () => {
      identityVerification.isApproved.mockResolvedValue(false); // registry's own default with no provider
      prisma.merchantPayable.findMany.mockResolvedValue([{ id: 'p1', orderId: 'order1' }]);
      prisma.order.findMany.mockResolvedValue([{ id: 'order1', status: 'DELIVERED' }]);
      prisma.merchantPayable.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.schedulePayoutRun('merchantOrg1', 'owner1');
      expect(result.verified).toBe(false);
    });
  });

  describe('processPayoutRun', () => {
    it('pays every SCHEDULED payable and publishes MerchantPayablePaid for each', async () => {
      const due = [
        { id: 'p1', netPayableMinor: 1_000 },
        { id: 'p2', netPayableMinor: 2_000 },
      ];
      prisma.merchantPayable.findMany.mockResolvedValue(due);
      prisma.merchantPayable.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.processPayoutRun('merchantOrg1', 'admin1');

      expect(result).toEqual({ paidCount: 2, totalNetMinor: 3_000 });
      expect(events.publish).toHaveBeenCalledTimes(2);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'admin1' }));
    });

    it('is a no-op when nothing is SCHEDULED', async () => {
      prisma.merchantPayable.findMany.mockResolvedValue([]);
      const result = await service.processPayoutRun('merchantOrg1', 'admin1');
      expect(result).toEqual({ paidCount: 0, totalNetMinor: 0 });
      expect(prisma.merchantPayable.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('dispute / resolveDispute — the toxic pair', () => {
    it('marks a payable DISPUTED with a reason', async () => {
      prisma.merchantPayable.findUnique.mockResolvedValue({ id: 'p1', status: 'OPEN' });
      prisma.merchantPayable.update.mockResolvedValue({ id: 'p1', status: 'DISPUTED' });

      await service.dispute('p1', 'staff1', 'wrong amount');

      expect(prisma.merchantPayable.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DISPUTED', disputedByUserId: 'staff1', disputeReason: 'wrong amount' }) }),
      );
    });

    it('refuses a dispute with no reason', async () => {
      await expect(service.dispute('p1', 'staff1', '  ')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to dispute an already-PAID payable', async () => {
      prisma.merchantPayable.findUnique.mockResolvedValue({ id: 'p1', status: 'PAID' });
      await expect(service.dispute('p1', 'staff1', 'too late')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses when the resolver is the payable\'s own disputer', async () => {
      prisma.merchantPayable.findUnique.mockResolvedValue({ id: 'p1', status: 'DISPUTED', disputedByUserId: 'staff1' });
      await expect(service.resolveDispute('p1', 'staff1', 'SCHEDULED')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to resolve a payable that is not DISPUTED', async () => {
      prisma.merchantPayable.findUnique.mockResolvedValue({ id: 'p1', status: 'OPEN' });
      await expect(service.resolveDispute('p1', 'staff2', 'SCHEDULED')).rejects.toBeInstanceOf(ConflictException);
    });

    it('a different staff member CAN resolve the dispute', async () => {
      prisma.merchantPayable.findUnique.mockResolvedValue({ id: 'p1', status: 'DISPUTED', disputedByUserId: 'staff1' });
      prisma.merchantPayable.update.mockResolvedValue({ id: 'p1', status: 'SCHEDULED' });

      await service.resolveDispute('p1', 'staff2', 'SCHEDULED');

      expect(prisma.merchantPayable.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SCHEDULED', resolvedByUserId: 'staff2' }) }),
      );
    });
  });

  describe('findOne', () => {
    it('404s for a payable that does not exist', async () => {
      prisma.merchantPayable.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('previewPayoutRun — dry run before live', () => {
    it('reads SCHEDULED payables with no write', async () => {
      prisma.merchantPayable.findMany.mockResolvedValue([{ id: 'p1', netPayableMinor: 1_000 }]);
      const result = await service.previewPayoutRun('merchantOrg1');
      expect(result).toEqual({ count: 1, totalNetMinor: 1_000, payables: [{ id: 'p1', netPayableMinor: 1_000 }] });
      expect(prisma.merchantPayable.update).not.toHaveBeenCalled();
      expect(prisma.merchantPayable.updateMany).not.toHaveBeenCalled();
    });
  });
});

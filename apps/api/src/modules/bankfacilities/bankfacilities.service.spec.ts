import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { AuditService } from '../../core/audit/audit.service';
import { BankFacilitiesService } from './bankfacilities.service';

/**
 * finance-accounting/167-bank-facility-management.md. Utilization is never
 * a stored counter — every test that depends on it mocks the two
 * aggregate() calls `utilizationOf()` makes, the same way a real Postgres
 * would answer them.
 */
describe('BankFacilitiesService', () => {
  let service: BankFacilitiesService;
  let prisma: any;
  let settings: any;
  let events: any;
  let audit: any;

  const mockUtilization = (drawnMinor: number, repaidPrincipalMinor: number) => {
    prisma.bankFacilityDrawdown.aggregate.mockResolvedValue({ _sum: { amountMinor: drawnMinor } });
    prisma.bankFacilityRepayment.aggregate.mockResolvedValue({ _sum: { principalMinor: repaidPrincipalMinor } });
  };

  beforeEach(async () => {
    prisma = {
      bank: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
      bankFacility: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
      bankFacilityDrawdown: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
      bankFacilityRepayment: { create: jest.fn(), aggregate: jest.fn() },
      bankFacilityMarkupAccrual: { findUnique: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    settings = { get: jest.fn().mockResolvedValue(1_000_000) };
    events = { publish: jest.fn() };
    audit = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankFacilitiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
        { provide: EventBusService, useValue: events },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(BankFacilitiesService);
  });

  describe('createFacility', () => {
    it('throws NotFoundException for a missing bank', async () => {
      prisma.bank.findUnique.mockResolvedValue(null);
      await expect(
        service.createFacility({
          bankId: 'b1',
          key: 'k',
          label: 'L',
          facilityType: 'RUNNING_FINANCE',
          limitMinor: 1000,
          markupRateBps: 2000,
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a maturityDate at or before startDate', async () => {
      prisma.bank.findUnique.mockResolvedValue({ id: 'b1' });
      await expect(
        service.createFacility({
          bankId: 'b1',
          key: 'k',
          label: 'L',
          facilityType: 'RUNNING_FINANCE',
          limitMinor: 1000,
          markupRateBps: 2000,
          startDate: '2027-01-01',
          maturityDate: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('utilizationOf', () => {
    it('is posted drawdowns minus repaid principal', async () => {
      mockUtilization(5000, 2000);
      await expect(service.utilizationOf('f1')).resolves.toBe(3000);
      expect(prisma.bankFacilityDrawdown.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { facilityId: 'f1', postedAt: { not: null } } }),
      );
    });

    it('is zero when nothing has posted', async () => {
      mockUtilization(0, 0);
      await expect(service.utilizationOf('f1')).resolves.toBe(0);
    });
  });

  describe('recordDrawdown', () => {
    const FACILITY = { id: 'f1', status: 'ACTIVE', limitMinor: 10_000 };

    it('throws NotFoundException for a missing facility', async () => {
      prisma.bankFacility.findUnique.mockResolvedValue(null);
      await expect(service.recordDrawdown('f1', { amountMinor: 1000, drawdownDate: '2026-01-01' }, 'u1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses a drawdown against a CLOSED facility', async () => {
      prisma.bankFacility.findUnique.mockResolvedValue({ ...FACILITY, status: 'CLOSED' });
      await expect(service.recordDrawdown('f1', { amountMinor: 1000, drawdownDate: '2026-01-01' }, 'u1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses outright — before ever recording — a drawdown that would breach the facility limit', async () => {
      prisma.bankFacility.findUnique.mockResolvedValue(FACILITY);
      mockUtilization(9500, 0); // 9500 utilized already

      await expect(service.recordDrawdown('f1', { amountMinor: 1000, drawdownDate: '2026-01-01' }, 'u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.bankFacilityDrawdown.create).not.toHaveBeenCalled();
    });

    it('posts immediately at or below the approval threshold', async () => {
      settings.get.mockResolvedValue(50_000);
      prisma.bankFacility.findUnique.mockResolvedValue(FACILITY);
      mockUtilization(0, 0);
      prisma.bankFacilityDrawdown.create.mockResolvedValue({ id: 'd1', facilityId: 'f1', amountMinor: 1000, createdById: 'u1', postedAt: null });
      prisma.bankFacilityDrawdown.findUnique.mockResolvedValue({ id: 'd1', facilityId: 'f1', amountMinor: 1000, createdById: 'u1', postedAt: null });
      prisma.bankFacilityDrawdown.update.mockResolvedValue({
        id: 'd1',
        facilityId: 'f1',
        amountMinor: 1000,
        drawdownDate: new Date('2026-01-01'),
        postedAt: new Date(),
      });

      const result = await service.recordDrawdown('f1', { amountMinor: 1000, drawdownDate: '2026-01-01' }, 'u1');

      expect(result.postedAt).not.toBeNull();
      expect(events.publish).toHaveBeenCalledWith(
        'bank_facility.drawdown_posted',
        expect.objectContaining({ drawdownId: 'd1', facilityId: 'f1', amountMinor: 1000 }),
        prisma,
      );
    });

    it('leaves an above-threshold drawdown unposted, pending approval', async () => {
      settings.get.mockResolvedValue(500);
      prisma.bankFacility.findUnique.mockResolvedValue(FACILITY);
      mockUtilization(0, 0);
      prisma.bankFacilityDrawdown.create.mockResolvedValue({ id: 'd1', facilityId: 'f1', amountMinor: 1000, createdById: 'u1', postedAt: null });

      const result = await service.recordDrawdown('f1', { amountMinor: 1000, drawdownDate: '2026-01-01' }, 'u1');

      expect(result.postedAt).toBeNull();
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('approveDrawdown', () => {
    it('refuses the requester approving their own', async () => {
      prisma.bankFacilityDrawdown.findUnique.mockResolvedValue({ id: 'd1', createdById: 'u1', postedAt: null });
      await expect(service.approveDrawdown('d1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an already-posted drawdown', async () => {
      prisma.bankFacilityDrawdown.findUnique.mockResolvedValue({ id: 'd1', createdById: 'u1', postedAt: new Date() });
      await expect(service.approveDrawdown('d1', 'u2')).rejects.toBeInstanceOf(ConflictException);
    });

    it('approves when a different actor confirms', async () => {
      prisma.bankFacilityDrawdown.findUnique.mockResolvedValue({ id: 'd1', createdById: 'u1', postedAt: null });
      await service.approveDrawdown('d1', 'u2');
      expect(prisma.bankFacilityDrawdown.update).toHaveBeenCalledWith(expect.objectContaining({ data: { approvedById: 'u2' } }));
    });
  });

  describe('postDrawdown', () => {
    it('refuses above the threshold with no approval at all', async () => {
      settings.get.mockResolvedValue(500);
      prisma.bankFacilityDrawdown.findUnique.mockResolvedValue({ id: 'd1', amountMinor: 1000, createdById: 'u1', approvedById: null, postedAt: null });
      await expect(service.postDrawdown('d1', 'u1')).rejects.toThrow(/approve_drawdown/);
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('refuses above the threshold when the approver is the same as the requester', async () => {
      settings.get.mockResolvedValue(500);
      prisma.bankFacilityDrawdown.findUnique.mockResolvedValue({ id: 'd1', amountMinor: 1000, createdById: 'u1', approvedById: 'u1', postedAt: null });
      await expect(service.postDrawdown('d1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('posts above the threshold once a different actor has approved', async () => {
      settings.get.mockResolvedValue(500);
      prisma.bankFacilityDrawdown.findUnique.mockResolvedValue({ id: 'd1', facilityId: 'f1', amountMinor: 1000, createdById: 'u1', approvedById: 'u2', postedAt: null });
      prisma.bankFacilityDrawdown.update.mockResolvedValue({
        id: 'd1',
        facilityId: 'f1',
        amountMinor: 1000,
        drawdownDate: new Date('2026-01-01'),
        postedAt: new Date(),
      });

      await service.postDrawdown('d1', 'u3');

      expect(events.publish).toHaveBeenCalledWith('bank_facility.drawdown_posted', expect.objectContaining({ facilityId: 'f1' }), prisma);
    });
  });

  describe('recordRepayment', () => {
    it('refuses a repayment with neither principal nor markup', async () => {
      prisma.bankFacility.findUnique.mockResolvedValue({ id: 'f1' });
      await expect(service.recordRepayment('f1', { repaymentDate: '2026-01-01' }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException for a missing facility', async () => {
      prisma.bankFacility.findUnique.mockResolvedValue(null);
      await expect(
        service.recordRepayment('f1', { principalMinor: 500, repaymentDate: '2026-01-01' }, 'u1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('publishes principal and markup as recorded, posting immediately — a repayment is a RECORD, never refused once the facility exists', async () => {
      prisma.bankFacility.findUnique.mockResolvedValue({ id: 'f1' });
      prisma.bankFacilityRepayment.create.mockResolvedValue({
        id: 'r1',
        facilityId: 'f1',
        principalMinor: 500,
        markupMinor: 100,
        repaymentDate: new Date('2026-01-01'),
      });

      await service.recordRepayment('f1', { principalMinor: 500, markupMinor: 100, repaymentDate: '2026-01-01' }, 'u1');

      expect(events.publish).toHaveBeenCalledWith(
        'bank_facility.repayment_recorded',
        expect.objectContaining({ repaymentId: 'r1', facilityId: 'f1', principalMinor: 500, markupMinor: 100 }),
        prisma,
      );
    });
  });

  describe('postMonthlyMarkupAccruals', () => {
    it('skips a facility already accrued this period', async () => {
      prisma.bankFacility.findMany.mockResolvedValue([{ id: 'f1', status: 'ACTIVE', markupRateBps: 2000 }]);
      prisma.bankFacilityMarkupAccrual.findUnique.mockResolvedValue({ id: 'existing' });

      const result = await service.postMonthlyMarkupAccruals();

      expect(result).toEqual({ posted: 0, skipped: 1 });
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('skips a facility with zero outstanding balance', async () => {
      prisma.bankFacility.findMany.mockResolvedValue([{ id: 'f1', status: 'ACTIVE', markupRateBps: 2000 }]);
      prisma.bankFacilityMarkupAccrual.findUnique.mockResolvedValue(null);
      mockUtilization(0, 0);

      const result = await service.postMonthlyMarkupAccruals();

      expect(result).toEqual({ posted: 0, skipped: 1 });
    });

    it('posts one month of markup on the outstanding balance and publishes the event', async () => {
      prisma.bankFacility.findMany.mockResolvedValue([{ id: 'f1', status: 'ACTIVE', markupRateBps: 1200 }]); // 12% annual
      prisma.bankFacilityMarkupAccrual.findUnique.mockResolvedValue(null);
      mockUtilization(1_200_000, 0); // 1,200,000 outstanding -> 12,000/mo at 12% annual

      const result = await service.postMonthlyMarkupAccruals();

      expect(result).toEqual({ posted: 1, skipped: 0 });
      expect(prisma.bankFacilityMarkupAccrual.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ facilityId: 'f1', amountMinor: 12_000 }) }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        'bank_facility.markup_accrued',
        expect.objectContaining({ facilityId: 'f1', amountMinor: 12_000 }),
        prisma,
      );
    });
  });
});

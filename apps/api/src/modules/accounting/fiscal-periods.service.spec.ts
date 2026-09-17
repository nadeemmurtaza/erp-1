import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { FiscalPeriodsService } from './fiscal-periods.service';

describe('FiscalPeriodsService — WO-19.5', () => {
  let service: FiscalPeriodsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      fiscalYear: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn() },
      fiscalPeriod: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [FiscalPeriodsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(FiscalPeriodsService);
  });

  describe('createFiscalYear', () => {
    it('refuses startsOn on or after endsOn', async () => {
      await expect(
        service.createFiscalYear({ name: 'FY2026', startsOn: '2026-12-31', endsOn: '2026-01-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.fiscalYear.create).not.toHaveBeenCalled();
    });

    it('refuses a duplicate name', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue({ id: 'fy1' });

      await expect(
        service.createFiscalYear({ name: 'FY2026', startsOn: '2026-01-01', endsOn: '2027-01-01' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a valid fiscal year', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(null);
      prisma.fiscalYear.create.mockResolvedValue({ id: 'fy1', name: 'FY2026' });

      const result = await service.createFiscalYear({ name: 'FY2026', startsOn: '2026-01-01', endsOn: '2027-01-01' });

      expect(result.id).toBe('fy1');
    });
  });

  describe('createFiscalPeriod', () => {
    const FY = { id: 'fy1', name: 'FY2026', startsOn: new Date('2026-01-01'), endsOn: new Date('2027-01-01') };

    it('404s for an unknown fiscal year', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(null);

      await expect(
        service.createFiscalPeriod({ fiscalYearId: 'missing', name: 'P1', startsOn: '2026-01-01', endsOn: '2026-02-01' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a period outside its fiscal year', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(FY);

      await expect(
        service.createFiscalPeriod({
          fiscalYearId: 'fy1',
          name: 'P13',
          startsOn: '2026-12-15',
          endsOn: '2027-01-15', // spills past FY2026's endsOn
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a duplicate period name within the same fiscal year', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(FY);
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1' });

      await expect(
        service.createFiscalPeriod({ fiscalYearId: 'fy1', name: 'P1', startsOn: '2026-01-01', endsOn: '2026-02-01' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a period that falls within its fiscal year', async () => {
      prisma.fiscalYear.findUnique.mockResolvedValue(FY);
      prisma.fiscalPeriod.findUnique.mockResolvedValue(null);
      prisma.fiscalPeriod.create.mockResolvedValue({ id: 'p1', name: 'P1', status: 'OPEN' });

      const result = await service.createFiscalPeriod({
        fiscalYearId: 'fy1',
        name: 'P1',
        startsOn: '2026-01-01',
        endsOn: '2026-02-01',
      });

      expect(result.status).toBe('OPEN');
    });
  });

  describe('closePeriod', () => {
    it('moves OPEN -> CLOSED', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'P1', status: 'OPEN' });
      prisma.fiscalPeriod.update.mockResolvedValue({ id: 'p1', status: 'CLOSED' });

      const result = await service.closePeriod('p1');

      expect(result.status).toBe('CLOSED');
      expect(prisma.fiscalPeriod.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'CLOSED' } });
    });

    it('refuses to close a period that is not OPEN', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'P1', status: 'CLOSED' });

      await expect(service.closePeriod('p1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.fiscalPeriod.update).not.toHaveBeenCalled();
    });

    it('404s for an unknown period', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue(null);

      await expect(service.closePeriod('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reopenPeriod', () => {
    it('moves CLOSED -> OPEN', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'P1', status: 'CLOSED' });
      prisma.fiscalPeriod.update.mockResolvedValue({ id: 'p1', status: 'OPEN' });

      const result = await service.reopenPeriod('p1');

      expect(result.status).toBe('OPEN');
    });

    it('refuses to reopen an already-OPEN period', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'P1', status: 'OPEN' });

      await expect(service.reopenPeriod('p1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to reopen a LOCKED period — permanent, matching R2', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'P1', status: 'LOCKED' });

      await expect(service.reopenPeriod('p1')).rejects.toThrow(/never be reopened/i);
      expect(prisma.fiscalPeriod.update).not.toHaveBeenCalled();
    });
  });

  describe('lockPeriod', () => {
    it('moves CLOSED -> LOCKED', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'P1', status: 'CLOSED' });
      prisma.fiscalPeriod.update.mockResolvedValue({ id: 'p1', status: 'LOCKED' });

      const result = await service.lockPeriod('p1');

      expect(result.status).toBe('LOCKED');
    });

    it('refuses to lock an OPEN period — must be closed first', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'P1', status: 'OPEN' });

      await expect(service.lockPeriod('p1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.fiscalPeriod.update).not.toHaveBeenCalled();
    });

    it('refuses to lock an already-LOCKED period', async () => {
      prisma.fiscalPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'P1', status: 'LOCKED' });

      await expect(service.lockPeriod('p1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

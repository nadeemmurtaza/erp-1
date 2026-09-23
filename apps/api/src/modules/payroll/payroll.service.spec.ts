import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PayrollService } from './payroll.service';

/**
 * WO-19.2 (docs/implementation/19-payroll.md) — compensation rates and the
 * salary calculator. Real PrismaService against the seeded test database,
 * same idiom as the rest of this session's service specs.
 */
describe('PayrollService', () => {
  let service: PayrollService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [PayrollService, PrismaService],
    }).compile();

    service = module.get(PayrollService);
    prisma = module.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.compensationRate.deleteMany({ where: { user: { email: { startsWith: 'payroll-spec-' } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'payroll-spec-' } } });
  });

  let seq = 0;
  function uid(): string {
    seq += 1;
    return `payroll-spec-${Date.now()}-${seq}`;
  }

  async function makeUser() {
    return prisma.user.create({ data: { email: `${uid()}@test.com`, firstName: 'payroll-spec', lastName: uid() } });
  }

  describe('setCompensationRate', () => {
    it('creates an open-ended rate with no prior row', async () => {
      const user = await makeUser();
      const rate = await service.setCompensationRate(user.id, 'MONTHLY', 5_000_00, new Date('2026-01-01'));

      expect(rate.amountMinor).toBe(5_000_00);
      expect(rate.effectiveTo).toBeNull();
    });

    it('closes the previously open rate at the new one\'s effectiveFrom', async () => {
      const user = await makeUser();
      const first = await service.setCompensationRate(user.id, 'MONTHLY', 5_000_00, new Date('2026-01-01'));
      await service.setCompensationRate(user.id, 'MONTHLY', 6_000_00, new Date('2026-06-01'));

      const closed = await prisma.compensationRate.findUniqueOrThrow({ where: { id: first.id } });
      expect(closed.effectiveTo).toEqual(new Date('2026-06-01'));

      const current = await service.currentRate(user.id);
      expect(current?.amountMinor).toBe(6_000_00);
      expect(current?.effectiveTo).toBeNull();
    });

    it('rejects a negative amount', async () => {
      const user = await makeUser();
      await expect(service.setCompensationRate(user.id, 'MONTHLY', -1, new Date())).rejects.toThrow(BadRequestException);
    });

    it('rejects a new rate that does not take effect after the current one', async () => {
      const user = await makeUser();
      await service.setCompensationRate(user.id, 'MONTHLY', 5_000_00, new Date('2026-06-01'));
      await expect(
        service.setCompensationRate(user.id, 'MONTHLY', 6_000_00, new Date('2026-01-01')),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('calculateGross — MONTHLY', () => {
    it('is 0 with no rate on record', async () => {
      const user = await makeUser();
      const result = await service.calculateGross(user.id, new Date('2026-01-01'), new Date('2026-02-01'));
      expect(result).toEqual({ grossMinor: 0, rateIds: [], missingInput: false });
    });

    it('pays the full monthly amount when the rate covers the whole period', async () => {
      const user = await makeUser();
      await service.setCompensationRate(user.id, 'MONTHLY', 3_000_00, new Date('2025-01-01'));

      const result = await service.calculateGross(user.id, new Date('2026-01-01'), new Date('2026-02-01'));
      expect(result.grossMinor).toBe(3_000_00);
      expect(result.missingInput).toBe(false);
    });

    it('splits proportionally across a mid-period raise', async () => {
      const user = await makeUser();
      // A 30-day period; rate doubles exactly at the 10-day mark.
      await service.setCompensationRate(user.id, 'MONTHLY', 3_000_00, new Date('2026-01-01'));
      await service.setCompensationRate(user.id, 'MONTHLY', 6_000_00, new Date('2026-01-11'));

      const result = await service.calculateGross(user.id, new Date('2026-01-01'), new Date('2026-01-31'));
      // 10/30 of 3000 + 20/30 of 6000 = 1000 + 4000 = 5000
      expect(result.grossMinor).toBe(5_000_00);
      expect(result.rateIds).toHaveLength(2);
    });

    it('rejects an inverted period', async () => {
      const user = await makeUser();
      await expect(
        service.calculateGross(user.id, new Date('2026-02-01'), new Date('2026-01-01')),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('calculateGross — HOURLY / COMMISSION honesty', () => {
    it('flags missingInput and pays 0 for HOURLY with no hoursWorked supplied', async () => {
      const user = await makeUser();
      await service.setCompensationRate(user.id, 'HOURLY', 500_00, new Date('2026-01-01'));

      const result = await service.calculateGross(user.id, new Date('2026-01-01'), new Date('2026-02-01'));
      expect(result.grossMinor).toBe(0);
      expect(result.missingInput).toBe(true);
    });

    it('computes rate × hoursWorked when supplied', async () => {
      const user = await makeUser();
      await service.setCompensationRate(user.id, 'HOURLY', 500_00, new Date('2026-01-01'));

      const result = await service.calculateGross(user.id, new Date('2026-01-01'), new Date('2026-02-01'), {
        hoursWorked: 160,
      });
      expect(result.grossMinor).toBe(500_00 * 160);
      expect(result.missingInput).toBe(false);
    });

    it('pays the prorated base and flags missingInput when COMMISSION has no commissionMinor', async () => {
      const user = await makeUser();
      await service.setCompensationRate(user.id, 'COMMISSION', 2_000_00, new Date('2025-01-01'));

      const result = await service.calculateGross(user.id, new Date('2026-01-01'), new Date('2026-02-01'));
      expect(result.grossMinor).toBe(2_000_00);
      expect(result.missingInput).toBe(true);
    });

    it('adds commissionMinor on top of the prorated base when supplied', async () => {
      const user = await makeUser();
      await service.setCompensationRate(user.id, 'COMMISSION', 2_000_00, new Date('2025-01-01'));

      const result = await service.calculateGross(user.id, new Date('2026-01-01'), new Date('2026-02-01'), {
        commissionMinor: 750_00,
      });
      expect(result.grossMinor).toBe(2_000_00 + 750_00);
      expect(result.missingInput).toBe(false);
    });
  });

  describe('requireUser', () => {
    it('throws NotFoundException for a nonexistent user', async () => {
      await expect(service.requireUser('nonexistent-id')).rejects.toThrow(NotFoundException);
    });

    it('resolves for a real user', async () => {
      const user = await makeUser();
      await expect(service.requireUser(user.id)).resolves.toBeUndefined();
    });
  });
});

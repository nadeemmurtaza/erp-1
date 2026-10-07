import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { countWorkingDays, LeaveService } from './leave.service';

/**
 * WO-19.3 (docs/implementation/payroll/19-payroll.md) — leave types, balances,
 * accrual and requests. Real PrismaService against the seeded test
 * database, same idiom as the rest of this session's service specs.
 */
describe('LeaveService', () => {
  let service: LeaveService;
  let prisma: PrismaService;
  let annualTypeId: string;
  let unpaidTypeId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [LeaveService, PrismaService],
    }).compile();

    service = module.get(LeaveService);
    prisma = module.get(PrismaService);

    const annual = await prisma.leaveType.create({
      data: { key: `payroll-spec-annual-${Date.now()}`, name: 'payroll-spec Annual', kind: 'ANNUAL', accrualDaysPerRun: 1.5 },
    });
    annualTypeId = annual.id;
    const unpaid = await prisma.leaveType.create({
      data: { key: `payroll-spec-unpaid-${Date.now()}`, name: 'payroll-spec Unpaid', kind: 'UNPAID', accrualDaysPerRun: 0 },
    });
    unpaidTypeId = unpaid.id;
  });

  afterAll(async () => {
    await prisma.leaveType.deleteMany({ where: { id: { in: [annualTypeId, unpaidTypeId] } } });
  });

  afterEach(async () => {
    await prisma.leaveRequest.deleteMany({ where: { user: { email: { startsWith: 'payroll-spec-' } } } });
    await prisma.leaveBalance.deleteMany({ where: { user: { email: { startsWith: 'payroll-spec-' } } } });
    await prisma.leaveAccrualRun.deleteMany({ where: { leaveTypeId: { in: [annualTypeId, unpaidTypeId] } } });
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

  async function grantBalance(userId: string, leaveTypeId: string, balance: number) {
    return prisma.leaveBalance.create({ data: { userId, leaveTypeId, balance } });
  }

  describe('countWorkingDays', () => {
    it('counts a single weekday as 1', () => {
      // 2026-09-21 is a Monday.
      expect(countWorkingDays(new Date('2026-09-21'), new Date('2026-09-21'))).toBe(1);
    });

    it('excludes Sundays from a Mon-Sun span', () => {
      // 2026-09-21 (Mon) through 2026-09-27 (Sun) — 7 calendar days, 1 Sunday.
      expect(countWorkingDays(new Date('2026-09-21'), new Date('2026-09-27'))).toBe(6);
    });

    it('rejects an inverted range', () => {
      expect(() => countWorkingDays(new Date('2026-09-27'), new Date('2026-09-21'))).toThrow(BadRequestException);
    });
  });

  describe('requestLeave / cancel', () => {
    it('creates a PENDING request without touching the balance', async () => {
      const user = await makeUser();
      await grantBalance(user.id, annualTypeId, 10);

      const request = await service.requestLeave(user.id, annualTypeId, new Date('2026-09-21'), new Date('2026-09-22'));
      expect(request.status).toBe('PENDING');
      expect(request.days).toBe(2);

      const [balance] = await service.balances(user.id);
      expect(balance.balance).toBe(10);
    });

    it('rejects a request against an unknown leave type', async () => {
      const user = await makeUser();
      await expect(
        service.requestLeave(user.id, 'nonexistent', new Date('2026-09-21'), new Date('2026-09-22')),
      ).rejects.toThrow(NotFoundException);
    });

    it('lets the requester cancel their own pending request', async () => {
      const user = await makeUser();
      const request = await service.requestLeave(user.id, annualTypeId, new Date('2026-09-21'), new Date('2026-09-21'));

      const cancelled = await service.cancel(request.id, user.id);
      expect(cancelled.status).toBe('CANCELLED');
    });

    it('refuses to let a different user cancel someone else\'s request', async () => {
      const owner = await makeUser();
      const other = await makeUser();
      const request = await service.requestLeave(owner.id, annualTypeId, new Date('2026-09-21'), new Date('2026-09-21'));

      await expect(service.cancel(request.id, other.id)).rejects.toThrow(ForbiddenException);
    });

    it('refuses to cancel an already-decided request', async () => {
      const admin = await makeUser();
      const user = await makeUser();
      await grantBalance(user.id, annualTypeId, 10);
      const request = await service.requestLeave(user.id, annualTypeId, new Date('2026-09-21'), new Date('2026-09-21'));
      await service.decide(request.id, admin.id, 'APPROVED');

      await expect(service.cancel(request.id, user.id)).rejects.toThrow(BadRequestException);
    });
  });

  describe('decide', () => {
    it('debits the balance on APPROVED for a non-UNPAID type', async () => {
      const admin = await makeUser();
      const user = await makeUser();
      await grantBalance(user.id, annualTypeId, 10);
      const request = await service.requestLeave(user.id, annualTypeId, new Date('2026-09-21'), new Date('2026-09-22'));

      await service.decide(request.id, admin.id, 'APPROVED');

      const [balance] = await service.balances(user.id);
      expect(balance.balance).toBe(8);
    });

    it('rejects APPROVED when the balance is insufficient, and does not debit', async () => {
      const admin = await makeUser();
      const user = await makeUser();
      await grantBalance(user.id, annualTypeId, 1);
      const request = await service.requestLeave(user.id, annualTypeId, new Date('2026-09-21'), new Date('2026-09-22'));

      await expect(service.decide(request.id, admin.id, 'APPROVED')).rejects.toThrow(BadRequestException);

      const [balance] = await service.balances(user.id);
      expect(balance.balance).toBe(1);
    });

    it('does not touch any balance for an UNPAID type on APPROVED', async () => {
      const admin = await makeUser();
      const user = await makeUser();
      const request = await service.requestLeave(user.id, unpaidTypeId, new Date('2026-09-21'), new Date('2026-09-22'));

      const decided = await service.decide(request.id, admin.id, 'APPROVED');
      expect(decided.status).toBe('APPROVED');
      expect(await service.balances(user.id)).toEqual([]);
    });

    it('does not debit on REJECTED', async () => {
      const admin = await makeUser();
      const user = await makeUser();
      await grantBalance(user.id, annualTypeId, 10);
      const request = await service.requestLeave(user.id, annualTypeId, new Date('2026-09-21'), new Date('2026-09-22'));

      await service.decide(request.id, admin.id, 'REJECTED', 'not enough notice');

      const [balance] = await service.balances(user.id);
      expect(balance.balance).toBe(10);
    });

    it('refuses to decide an already-decided request twice', async () => {
      const admin = await makeUser();
      const user = await makeUser();
      await grantBalance(user.id, annualTypeId, 10);
      const request = await service.requestLeave(user.id, annualTypeId, new Date('2026-09-21'), new Date('2026-09-22'));
      await service.decide(request.id, admin.id, 'APPROVED');

      await expect(service.decide(request.id, admin.id, 'APPROVED')).rejects.toThrow(BadRequestException);
    });
  });

  describe('accrue', () => {
    it('credits every user with a CompensationRate on record', async () => {
      const user = await makeUser();
      await prisma.compensationRate.create({
        data: { userId: user.id, basis: 'MONTHLY', amountMinor: 5_000_00, effectiveFrom: new Date('2025-01-01') },
      });

      const { credited } = await service.accrue(annualTypeId, 'payroll-spec-2026-09');
      expect(credited).toBe(1);

      const [balance] = await service.balances(user.id);
      expect(balance.balance).toBe(1.5);
    });

    it('is idempotent for the same (leaveTypeId, period)', async () => {
      const user = await makeUser();
      await prisma.compensationRate.create({
        data: { userId: user.id, basis: 'MONTHLY', amountMinor: 5_000_00, effectiveFrom: new Date('2025-01-01') },
      });

      await service.accrue(annualTypeId, 'payroll-spec-2026-09');
      const second = await service.accrue(annualTypeId, 'payroll-spec-2026-09');

      expect(second.credited).toBe(0);
      const [balance] = await service.balances(user.id);
      expect(balance.balance).toBe(1.5);
    });

    it('adds to an existing balance rather than replacing it', async () => {
      const user = await makeUser();
      await prisma.compensationRate.create({
        data: { userId: user.id, basis: 'MONTHLY', amountMinor: 5_000_00, effectiveFrom: new Date('2025-01-01') },
      });
      await grantBalance(user.id, annualTypeId, 3);

      await service.accrue(annualTypeId, 'payroll-spec-2026-09');

      const [balance] = await service.balances(user.id);
      expect(balance.balance).toBe(4.5);
    });
  });
});

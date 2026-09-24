import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { DomainEvent } from '../../core/events/domain-events';
import { LeaveService } from './leave.service';
import { PayrollService } from './payroll.service';
import { PayRunService } from './pay-run.service';

/**
 * WO-19.4 (docs/implementation/payroll/19-payroll.md) — pay-run build, approve,
 * post. Real PrismaService/SettingsService against the seeded test
 * database, same idiom as ProductionService's own spec; AppConfigService
 * and EventBusService mocked the same way that spec mocks them.
 */
describe('PayRunService', () => {
  let payRuns: PayRunService;
  let leave: LeaveService;
  let prisma: PrismaService;
  let events: { publish: jest.Mock };
  let annualTypeId: string;
  let unpaidTypeId: string;

  beforeAll(async () => {
    events = { publish: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PayRunService,
        PayrollService,
        LeaveService,
        PrismaService,
        SettingsService,
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: 'main' } },
        { provide: EventBusService, useValue: events },
      ],
    }).compile();

    payRuns = module.get(PayRunService);
    leave = module.get(LeaveService);
    prisma = module.get(PrismaService);

    const unpaid = await prisma.leaveType.create({
      data: { key: `payroll-spec-run-unpaid-${Date.now()}`, name: 'payroll-spec run Unpaid', kind: 'UNPAID', accrualDaysPerRun: 0 },
    });
    unpaidTypeId = unpaid.id;
    const annual = await prisma.leaveType.create({
      data: { key: `payroll-spec-run-annual-${Date.now()}`, name: 'payroll-spec run Annual', kind: 'ANNUAL', accrualDaysPerRun: 0 },
    });
    annualTypeId = annual.id;
  });

  afterAll(async () => {
    await prisma.leaveType.deleteMany({ where: { id: { in: [unpaidTypeId, annualTypeId] } } });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await prisma.payRunAdjustment.deleteMany({ where: { user: { email: { startsWith: 'payroll-spec-' } } } });
    await prisma.payRunLine.deleteMany({ where: { user: { email: { startsWith: 'payroll-spec-' } } } });
    await prisma.payRun.deleteMany({ where: { createdBy: { email: { startsWith: 'payroll-spec-' } } } });
    await prisma.leaveRequest.deleteMany({ where: { user: { email: { startsWith: 'payroll-spec-' } } } });
    await prisma.leaveBalance.deleteMany({ where: { user: { email: { startsWith: 'payroll-spec-' } } } });
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

  // A 31-day January — a fixed, deterministic period every test reuses.
  const periodStart = new Date('2026-01-01T00:00:00.000Z');
  const periodEnd = new Date('2026-02-01T00:00:00.000Z');

  describe('build', () => {
    it('creates one DRAFT line per payee with a rate overlapping the period', async () => {
      const admin = await makeUser();
      const payee = await makeUser();
      await prisma.compensationRate.create({
        data: { userId: payee.id, basis: 'MONTHLY', amountMinor: 6_000_00, effectiveFrom: new Date('2025-01-01') },
      });

      const run = await payRuns.build(periodStart, periodEnd, 'BRAND', admin.id);

      expect(run.status).toBe('DRAFT');
      expect(run.number).toMatch(/^PAY-\d{4}-\d{4}$/);
      expect(run.lines).toHaveLength(1);
      expect(run.lines[0].userId).toBe(payee.id);
      expect(run.lines[0].grossMinor).toBe(6_000_00);
      expect(run.lines[0].netMinor).toBe(6_000_00);
    });

    it('deducts approved UNPAID leave from net but leaves gross untouched', async () => {
      const admin = await makeUser();
      const payee = await makeUser();
      await prisma.compensationRate.create({
        data: { userId: payee.id, basis: 'MONTHLY', amountMinor: 6_000_00, effectiveFrom: new Date('2025-01-01') },
      });
      const request = await leave.requestLeave(payee.id, unpaidTypeId, new Date('2026-01-05'), new Date('2026-01-05'));
      await leave.decide(request.id, admin.id, 'APPROVED');

      const run = await payRuns.build(periodStart, periodEnd, 'BRAND', admin.id);

      const line = run.lines.find((l) => l.userId === payee.id)!;
      expect(line.grossMinor).toBe(6_000_00);
      expect(line.unpaidLeaveDays).toBe(1);
      expect(line.unpaidLeaveMinor).toBeGreaterThan(0);
      expect(line.netMinor).toBe(line.grossMinor - line.unpaidLeaveMinor);
    });

    it('does not deduct APPROVED leave of a paid (non-UNPAID) type', async () => {
      const admin = await makeUser();
      const payee = await makeUser();
      await prisma.compensationRate.create({
        data: { userId: payee.id, basis: 'MONTHLY', amountMinor: 6_000_00, effectiveFrom: new Date('2025-01-01') },
      });
      await prisma.leaveBalance.create({ data: { userId: payee.id, leaveTypeId: annualTypeId, balance: 10 } });
      const request = await leave.requestLeave(payee.id, annualTypeId, new Date('2026-01-05'), new Date('2026-01-05'));
      await leave.decide(request.id, admin.id, 'APPROVED');

      const run = await payRuns.build(periodStart, periodEnd, 'BRAND', admin.id);

      const line = run.lines.find((l) => l.userId === payee.id)!;
      expect(line.unpaidLeaveDays).toBe(0);
      expect(line.netMinor).toBe(line.grossMinor);
    });

    it('skips a user with no CompensationRate row overlapping the period at all', async () => {
      const admin = await makeUser();
      const payee = await makeUser();
      // Rate starts after the period ends — not overlapping.
      await prisma.compensationRate.create({
        data: { userId: payee.id, basis: 'MONTHLY', amountMinor: 6_000_00, effectiveFrom: new Date('2026-06-01') },
      });

      const run = await payRuns.build(periodStart, periodEnd, 'BRAND', admin.id);

      expect(run.lines.find((l) => l.userId === payee.id)).toBeUndefined();
    });

    it('rejects an inverted period', async () => {
      const admin = await makeUser();
      await expect(payRuns.build(periodEnd, periodStart, 'BRAND', admin.id)).rejects.toThrow(BadRequestException);
    });

    it('rebuild replaces lines rather than appending a second set', async () => {
      const admin = await makeUser();
      const payee = await makeUser();
      await prisma.compensationRate.create({
        data: { userId: payee.id, basis: 'MONTHLY', amountMinor: 6_000_00, effectiveFrom: new Date('2025-01-01') },
      });

      const first = await payRuns.build(periodStart, periodEnd, 'BRAND', admin.id);
      const rebuilt = await payRuns.build(periodStart, periodEnd, 'BRAND', admin.id, first.id);

      expect(rebuilt.id).toBe(first.id);
      expect(rebuilt.number).toBe(first.number);
      expect(rebuilt.lines).toHaveLength(1);
    });

    it('refuses to rebuild a non-DRAFT run', async () => {
      const admin = await makeUser();
      const run = await payRuns.build(periodStart, periodEnd, 'BRAND', admin.id);
      await payRuns.approve(run.id, admin.id);

      await expect(payRuns.build(periodStart, periodEnd, 'BRAND', admin.id, run.id)).rejects.toThrow(BadRequestException);
    });
  });

  describe('approve / post lifecycle', () => {
    it('walks DRAFT -> APPROVED -> POSTED and fires PayrollRunPosted exactly once', async () => {
      const admin = await makeUser();
      const payee = await makeUser();
      await prisma.compensationRate.create({
        data: { userId: payee.id, basis: 'MONTHLY', amountMinor: 6_000_00, effectiveFrom: new Date('2025-01-01') },
      });

      const built = await payRuns.build(periodStart, periodEnd, 'BRAND', admin.id);
      const approved = await payRuns.approve(built.id, admin.id);
      expect(approved.status).toBe('APPROVED');
      expect(approved.approvedById).toBe(admin.id);

      const posted = await payRuns.post(built.id);
      expect(posted.status).toBe('POSTED');
      expect(posted.postedAt).not.toBeNull();

      expect(events.publish).toHaveBeenCalledTimes(1);
      expect(events.publish.mock.calls[0][0]).toBe(DomainEvent.PayrollRunPosted);
      expect(events.publish.mock.calls[0][1]).toMatchObject({ payRunId: built.id, grossMinor: 6_000_00 });
    });

    it('refuses to approve a non-DRAFT run', async () => {
      const admin = await makeUser();
      const run = await payRuns.build(periodStart, periodEnd, 'BRAND', admin.id);
      await payRuns.approve(run.id, admin.id);

      await expect(payRuns.approve(run.id, admin.id)).rejects.toThrow(BadRequestException);
    });

    it('refuses to post a still-DRAFT run', async () => {
      const admin = await makeUser();
      const run = await payRuns.build(periodStart, periodEnd, 'BRAND', admin.id);

      await expect(payRuns.post(run.id)).rejects.toThrow(BadRequestException);
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a nonexistent pay run', async () => {
      await expect(payRuns.approve('nonexistent', 'admin')).rejects.toThrow(NotFoundException);
      await expect(payRuns.post('nonexistent')).rejects.toThrow(NotFoundException);
      await expect(payRuns.get('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('postAdjustment — WO-19.5', () => {
    async function postedRun() {
      const admin = await makeUser();
      const payee = await makeUser();
      await prisma.compensationRate.create({
        data: { userId: payee.id, basis: 'MONTHLY', amountMinor: 6_000_00, effectiveFrom: new Date('2025-01-01') },
      });
      const run = await payRuns.build(periodStart, periodEnd, 'BRAND', admin.id);
      await payRuns.approve(run.id, admin.id);
      await payRuns.post(run.id);
      return { admin, payee, run };
    }

    it('creates the adjustment row and fires PayrollAdjustmentPosted', async () => {
      const { admin, payee, run } = await postedRun();

      const adjustment = await payRuns.postAdjustment(run.id, payee.id, 'OVERPAYMENT', 500_00, 'paid twice by mistake', admin.id);

      expect(adjustment.reason).toBe('OVERPAYMENT');
      expect(adjustment.amountMinor).toBe(500_00);
      expect(events.publish).toHaveBeenCalledTimes(2); // PayrollRunPosted (post) + PayrollAdjustmentPosted
      expect(events.publish.mock.calls[1][0]).toBe(DomainEvent.PayrollAdjustmentPosted);
      expect(events.publish.mock.calls[1][1]).toMatchObject({
        adjustmentId: adjustment.id,
        payRunId: run.id,
        reason: 'OVERPAYMENT',
        amountMinor: 500_00,
      });
    });

    it('refuses an adjustment against a DRAFT pay run', async () => {
      const admin = await makeUser();
      const payee = await makeUser();
      await prisma.compensationRate.create({
        data: { userId: payee.id, basis: 'MONTHLY', amountMinor: 6_000_00, effectiveFrom: new Date('2025-01-01') },
      });
      const run = await payRuns.build(periodStart, periodEnd, 'BRAND', admin.id);

      await expect(
        payRuns.postAdjustment(run.id, payee.id, 'CORRECTION', 100_00, 'note', admin.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-positive amount', async () => {
      const { admin, payee, run } = await postedRun();
      await expect(
        payRuns.postAdjustment(run.id, payee.id, 'CORRECTION', 0, 'note', admin.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for a nonexistent pay run', async () => {
      const admin = await makeUser();
      await expect(
        payRuns.postAdjustment('nonexistent', admin.id, 'CORRECTION', 100_00, 'note', admin.id),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

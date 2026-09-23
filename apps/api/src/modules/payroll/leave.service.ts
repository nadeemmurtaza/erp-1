import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { LeaveBalance, LeaveRequest, LeaveRequestStatus, LeaveType } from '../../core/prisma/client';

/**
 * The days a leave request spans, Monday–Saturday counted, Sunday not —
 * the "plain Mon–Sat week" fallback 19-payroll.md WO-19.3 names, since no
 * working-day/holiday calendar exists anywhere else in this codebase to
 * reuse instead (checked: no hit for "working day"/"business day"/"holiday"
 * as a real concept, only as copy text in email templates).
 */
export function countWorkingDays(startDate: Date, endDate: Date): number {
  if (endDate < startDate) throw new BadRequestException('endDate must not be before startDate.');
  let days = 0;
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  while (cursor <= end) {
    if (cursor.getUTCDay() !== 0) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** "2026-09" — the accrual period a date falls in. */
export function accrualPeriodKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

  async listTypes(activeOnly = true): Promise<LeaveType[]> {
    return this.prisma.leaveType.findMany({ where: activeOnly ? { isActive: true } : {}, orderBy: { name: 'asc' } });
  }

  async balances(userId: string): Promise<LeaveBalance[]> {
    return this.prisma.leaveBalance.findMany({ where: { userId }, include: { leaveType: true } });
  }

  async requests(userId: string): Promise<LeaveRequest[]> {
    return this.prisma.leaveRequest.findMany({
      where: { userId },
      include: { leaveType: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Does NOT debit LeaveBalance — only `decide()`'s APPROVED path does, so
   * a pending request never blocks a second request from starting against
   * the same balance (19-payroll.md WO-19.3).
   */
  async requestLeave(
    userId: string,
    leaveTypeId: string,
    startDate: Date,
    endDate: Date,
    reason?: string,
  ): Promise<LeaveRequest> {
    const leaveType = await this.prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
    if (!leaveType || !leaveType.isActive) throw new NotFoundException('No such active leave type.');

    const days = countWorkingDays(startDate, endDate);
    return this.prisma.leaveRequest.create({
      data: { userId, leaveTypeId, startDate, endDate, days, reason },
    });
  }

  async cancel(requestId: string, userId: string): Promise<LeaveRequest> {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('No such leave request.');
    if (request.userId !== userId) throw new ForbiddenException('Not your leave request.');
    if (request.status !== 'PENDING') throw new BadRequestException('Only a pending request can be cancelled.');

    return this.prisma.leaveRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED' } });
  }

  /**
   * APPROVED on a non-UNPAID type debits LeaveBalance, clamped at zero —
   * a request exceeding balance is rejected here with a stated reason
   * (FLO-7), never allowed to drive a balance negative. UNPAID approvals
   * debit nothing; there is no balance for unpaid leave to draw down, and
   * PayrollService.calculateGross reads unpaid days from the pay-run
   * builder (WO-19.4), not from this table.
   */
  async decide(
    requestId: string,
    decidedById: string,
    status: Extract<LeaveRequestStatus, 'APPROVED' | 'REJECTED'>,
    note?: string,
  ): Promise<LeaveRequest> {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.leaveRequest.findUnique({ where: { id: requestId }, include: { leaveType: true } });
      if (!request) throw new NotFoundException('No such leave request.');
      if (request.status !== 'PENDING') throw new BadRequestException('This request has already been decided.');

      if (status === 'APPROVED' && request.leaveType.kind !== 'UNPAID') {
        const balance = await tx.leaveBalance.findUnique({
          where: { userId_leaveTypeId: { userId: request.userId, leaveTypeId: request.leaveTypeId } },
        });
        const available = balance?.balance ?? 0;
        if (available < request.days) {
          throw new BadRequestException(
            `Insufficient ${request.leaveType.name} balance: ${available} day(s) available, ${request.days} requested.`,
          );
        }
        await tx.leaveBalance.update({
          where: { userId_leaveTypeId: { userId: request.userId, leaveTypeId: request.leaveTypeId } },
          data: { balance: Math.max(0, available - request.days) },
        });
      }

      return tx.leaveRequest.update({
        where: { id: requestId },
        data: { status, decidedById, decidedAt: new Date(), decisionNote: note },
      });
    });
  }

  /**
   * Credits every active LeaveBalance for one LeaveType by its
   * accrualDaysPerRun, once per period — idempotent via LeaveAccrualRun's
   * unique(leaveTypeId, period), the same shape FinanceCron's own
   * recurring-expense idempotency uses (WO-B.2). Returns 0 without writing
   * anything if this period was already run.
   */
  async accrue(leaveTypeId: string, period: string): Promise<{ credited: number }> {
    const leaveType = await this.prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
    if (!leaveType || !leaveType.isActive || leaveType.accrualDaysPerRun <= 0) return { credited: 0 };

    return this.prisma.$transaction(async (tx) => {
      const already = await tx.leaveAccrualRun.findUnique({
        where: { leaveTypeId_period: { leaveTypeId, period } },
      });
      if (already) return { credited: 0 };

      await tx.leaveAccrualRun.create({ data: { leaveTypeId, period } });

      const balances = await tx.leaveBalance.findMany({ where: { leaveTypeId } });
      const balanceByUser = new Map(balances.map((b) => [b.userId, b]));

      // Every user who already has a balance row for this type gets
      // credited; a user with no row yet is created lazily by the first
      // approved request or the first accrual — CompensationRate holders
      // are the closest thing to "every paid user", but crediting leave to
      // someone with no compensation on record yet would create a balance
      // for a person payroll does not otherwise know about.
      const rates = await tx.compensationRate.findMany({
        where: { effectiveTo: null },
        select: { userId: true },
        distinct: ['userId'],
      });

      let credited = 0;
      for (const { userId } of rates) {
        const existing = balanceByUser.get(userId);
        if (existing) {
          await tx.leaveBalance.update({
            where: { id: existing.id },
            data: { balance: existing.balance + leaveType.accrualDaysPerRun },
          });
        } else {
          await tx.leaveBalance.create({
            data: { userId, leaveTypeId, balance: leaveType.accrualDaysPerRun },
          });
        }
        credited += 1;
      }

      return { credited };
    });
  }
}

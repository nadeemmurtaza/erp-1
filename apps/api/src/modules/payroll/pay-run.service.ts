import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppConfigService } from '../../core/config/app-config.service';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';
import { documentNumber } from '../../core/settings/document-number';
import { documentPrefix } from '../../core/settings/document-prefix';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import type { Prisma, PayRun, ScopeLevel } from '../../core/prisma/client';
import { countWorkingDays } from './leave.service';
import { PayrollService } from './payroll.service';

const payRunInclude = {
  lines: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
  adjustments: true,
} satisfies Prisma.PayRunInclude;
export type PayRunWithLines = Prisma.PayRunGetPayload<{ include: typeof payRunInclude }>;

/** Node-prefixed per R6, the same PayRunNumberCounter pattern nextTransferNumber() uses. */
async function nextPayRunNumber(
  prisma: PrismaService,
  settings: SettingsService,
  config: AppConfigService,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = await documentPrefix(settings, 'payRun');

  const [{ counter }] = await prisma.$queryRaw<Array<{ counter: number }>>`
    INSERT INTO "PayRunNumberCounter" ("year", "counter") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "counter" = "PayRunNumberCounter"."counter" + 1
    RETURNING "counter"
  `;

  return documentNumber(config, prefix, year, counter);
}

/**
 * Pay-run build, approve, post (docs/implementation/19-payroll.md WO-19.4).
 * The pay run itself is deliberately agnostic to whether `accounting` is
 * enabled — post() always transitions the document and fires
 * PayrollRunPosted; the GL side is an additive posting rule in
 * posting-rules.subscriber.ts, reached only through that event, the same
 * non-coupling every other module's posting rule already demonstrates.
 */
@Injectable()
export class PayRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly events: EventBusService,
    private readonly payroll: PayrollService,
  ) {}

  async get(payRunId: string): Promise<PayRunWithLines> {
    const run = await this.prisma.payRun.findUnique({ where: { id: payRunId }, include: payRunInclude });
    if (!run) throw new NotFoundException('No such pay run.');
    return run;
  }

  async list(status?: PayRun['status']): Promise<PayRun[]> {
    return this.prisma.payRun.findMany({
      where: status ? { status } : {},
      orderBy: { periodStart: 'desc' },
    });
  }

  /**
   * Builds (or, while DRAFT, rebuilds) a pay run: one PayRunLine per User
   * with a CompensationRate overlapping the period — the closest thing to
   * "every paid user" this schema has on record, the same set
   * LeaveService.accrue() credits. Re-running a DRAFT run replaces its
   * lines outright rather than appending a second set.
   */
  async build(
    periodStart: Date,
    periodEnd: Date,
    scopeLevel: ScopeLevel,
    createdById: string,
    payRunId?: string,
  ): Promise<PayRunWithLines> {
    if (periodEnd <= periodStart) throw new BadRequestException('periodEnd must be after periodStart.');

    const run = payRunId
      ? await this.prisma.payRun.findUnique({ where: { id: payRunId } })
      : null;
    if (payRunId && !run) throw new NotFoundException('No such pay run.');
    if (run && run.status !== 'DRAFT') throw new BadRequestException('Only a DRAFT pay run can be rebuilt.');

    const payeeIds = await this.prisma.compensationRate.findMany({
      where: { effectiveFrom: { lt: periodEnd }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: periodStart } }] },
      select: { userId: true },
      distinct: ['userId'],
    });

    const workingDaysInPeriod = countWorkingDays(periodStart, new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000));
    const number = run ? null : await nextPayRunNumber(this.prisma, this.settings, this.config);

    return this.prisma.$transaction(async (tx) => {
      const id = run
        ? run.id
        : (
            await tx.payRun.create({
              data: {
                number: number!,
                periodStart,
                periodEnd,
                scopeLevel,
                originNodeId: this.config.nodeId,
                createdById,
              },
            })
          ).id;

      if (run) await tx.payRunLine.deleteMany({ where: { payRunId: id } });

      for (const { userId } of payeeIds) {
        const gross = await this.payroll.calculateGross(userId, periodStart, periodEnd);
        if (gross.rateIds.length === 0) continue;

        const unpaidRequests = await tx.leaveRequest.findMany({
          where: {
            userId,
            status: 'APPROVED',
            leaveType: { kind: 'UNPAID' },
            startDate: { lt: periodEnd },
            endDate: { gte: periodStart },
          },
        });
        const unpaidLeaveDays = unpaidRequests.reduce((sum, r) => sum + r.days, 0);
        const dailyRateMinor = workingDaysInPeriod > 0 ? gross.grossMinor / workingDaysInPeriod : 0;
        const unpaidLeaveMinor = Math.round(dailyRateMinor * unpaidLeaveDays);

        const deductionsMinor = 0; // No statutory rule modelled yet — see 19-payroll.md "Not modelled in this phase".
        const netMinor = gross.grossMinor - unpaidLeaveMinor - deductionsMinor;

        await tx.payRunLine.create({
          data: {
            payRunId: id,
            userId,
            compensationRateId: gross.rateIds[gross.rateIds.length - 1],
            grossMinor: gross.grossMinor,
            unpaidLeaveDays,
            unpaidLeaveMinor,
            deductions: [],
            deductionsMinor,
            netMinor,
          },
        });
      }

      return tx.payRun.findUniqueOrThrow({ where: { id }, include: payRunInclude });
    });
  }

  async approve(payRunId: string, approvedById: string): Promise<PayRun> {
    const run = await this.prisma.payRun.findUnique({ where: { id: payRunId } });
    if (!run) throw new NotFoundException('No such pay run.');
    if (run.status !== 'DRAFT') throw new BadRequestException('Only a DRAFT pay run can be approved.');

    return this.prisma.payRun.update({
      where: { id: payRunId },
      data: { status: 'APPROVED', approvedById, approvedAt: new Date() },
    });
  }

  /**
   * APPROVED → POSTED. Always fires PayrollRunPosted, whether or not
   * `accounting` is enabled — the posting rule that turns it into a
   * JournalEntry is the additive part, not this transition.
   */
  async post(payRunId: string): Promise<PayRun> {
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.payRun.findUnique({ where: { id: payRunId }, include: { lines: true } });
      if (!run) throw new NotFoundException('No such pay run.');
      if (run.status !== 'APPROVED') throw new BadRequestException('Only an APPROVED pay run can be posted.');

      const postedAt = new Date();
      const posted = await tx.payRun.update({ where: { id: payRunId }, data: { status: 'POSTED', postedAt } });

      const grossMinor = run.lines.reduce((sum, l) => sum + l.grossMinor, 0);
      const netMinor = run.lines.reduce((sum, l) => sum + l.netMinor, 0);
      const deductionsMinor = run.lines.reduce((sum, l) => sum + l.deductionsMinor, 0);

      await this.events.publish(
        DomainEvent.PayrollRunPosted,
        {
          payRunId: run.id,
          number: run.number,
          postedAt: postedAt.toISOString(),
          grossMinor,
          netMinor,
          deductionsMinor,
          scopeLevel: run.scopeLevel,
          originNodeId: run.originNodeId,
        },
        tx,
      );

      return posted;
    });
  }
}

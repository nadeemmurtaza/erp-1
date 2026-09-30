import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { CompensationBasis, CompensationRate } from '../../../core/prisma/client';

export interface GrossCalculationInput {
  /** HOURLY only — supplied by the caller; never derived from PosShift (see 19-payroll.md WO-19.2). */
  hoursWorked?: number;
  /** COMMISSION only — supplied by the caller; Order carries no salesperson attribution to derive it from. */
  commissionMinor?: number;
}

export interface GrossCalculationResult {
  grossMinor: number;
  /** The rate row(s) this figure was computed from — traceable, never a bare number. */
  rateIds: string[];
  /** True when a HOURLY/COMMISSION rate was in force but no input was supplied — the figure is 0, not a guess. */
  missingInput: boolean;
}

/**
 * Compensation rates and the salary calculator (docs/implementation/
 * 19-payroll.md WO-19.2).
 */
@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Opens a new rate, closing whichever rate was open for this user at
   * `effectiveFrom` — never two open-ended rows for one user. `effectiveFrom`
   * must be strictly after the currently-open rate's own `effectiveFrom`
   * (a rate history is append-only forward in time, never edited into the
   * past).
   */
  async setCompensationRate(
    userId: string,
    basis: CompensationBasis,
    amountMinor: number,
    effectiveFrom: Date,
    createdById?: string,
  ): Promise<CompensationRate> {
    if (amountMinor < 0) throw new BadRequestException('amountMinor cannot be negative.');

    return this.prisma.$transaction(async (tx) => {
      const open = await tx.compensationRate.findFirst({
        where: { userId, effectiveTo: null },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (open) {
        if (effectiveFrom <= open.effectiveFrom) {
          throw new BadRequestException(
            `A new rate must take effect after the current one's effectiveFrom (${open.effectiveFrom.toISOString()}).`,
          );
        }
        await tx.compensationRate.update({ where: { id: open.id }, data: { effectiveTo: effectiveFrom } });
      }

      return tx.compensationRate.create({
        data: { userId, basis, amountMinor, effectiveFrom, createdById },
      });
    });
  }

  /** Every rate row overlapping [periodStart, periodEnd), oldest first. */
  async ratesInPeriod(userId: string, periodStart: Date, periodEnd: Date): Promise<CompensationRate[]> {
    return this.prisma.compensationRate.findMany({
      where: {
        userId,
        effectiveFrom: { lt: periodEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: periodStart } }],
      },
      orderBy: { effectiveFrom: 'asc' },
    });
  }

  /**
   * MONTHLY prorates by days-in-force ÷ days-in-period across every
   * CompensationRate overlapping the period — a mid-period raise splits the
   * period between the old and new rate rather than applying either
   * retroactively to days it wasn't in force for.
   *
   * HOURLY/COMMISSION cannot be derived automatically — see this file's own
   * GrossCalculationInput doc and 19-payroll.md WO-19.2 for why. When a rate
   * of either basis is in force and the caller supplies no matching input,
   * that rate contributes 0 and `missingInput` comes back true, so a
   * pay-run preview shows an unmistakable $0 line rather than a plausible
   * wrong number.
   */
  async calculateGross(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
    input: GrossCalculationInput = {},
  ): Promise<GrossCalculationResult> {
    if (periodEnd <= periodStart) throw new BadRequestException('periodEnd must be after periodStart.');

    const rates = await this.ratesInPeriod(userId, periodStart, periodEnd);
    if (rates.length === 0) return { grossMinor: 0, rateIds: [], missingInput: false };

    const periodMs = periodEnd.getTime() - periodStart.getTime();
    let grossMinor = 0;
    let missingInput = false;

    for (const rate of rates) {
      const spanStart = rate.effectiveFrom > periodStart ? rate.effectiveFrom : periodStart;
      const spanEnd = rate.effectiveTo && rate.effectiveTo < periodEnd ? rate.effectiveTo : periodEnd;
      const spanMs = Math.max(0, spanEnd.getTime() - spanStart.getTime());
      if (spanMs === 0) continue;

      if (rate.basis === 'MONTHLY') {
        grossMinor += Math.round(rate.amountMinor * (spanMs / periodMs));
      } else if (rate.basis === 'HOURLY') {
        if (input.hoursWorked === undefined) missingInput = true;
        else grossMinor += Math.round(rate.amountMinor * input.hoursWorked);
      } else if (rate.basis === 'COMMISSION') {
        // amountMinor is the COMMISSION basis's base salary component,
        // prorated the same way MONTHLY is; commissionMinor adds on top.
        grossMinor += Math.round(rate.amountMinor * (spanMs / periodMs));
        if (input.commissionMinor === undefined) missingInput = true;
        else grossMinor += input.commissionMinor;
      }
    }

    return { grossMinor, rateIds: rates.map((r) => r.id), missingInput };
  }

  async currentRate(userId: string): Promise<CompensationRate | null> {
    return this.prisma.compensationRate.findFirst({
      where: { userId, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async rateHistory(userId: string): Promise<CompensationRate[]> {
    return this.prisma.compensationRate.findMany({
      where: { userId },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async requireUser(userId: string): Promise<void> {
    const exists = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) throw new NotFoundException('No such user.');
  }

  /**
   * Every currently-open CompensationRate, one per employee — the
   * WO-19.6 admin screen's own list, so it never has to N+1 currentRate()
   * per user in `/admin/users`.
   */
  async listCurrentRates(): Promise<Array<CompensationRate & { user: { id: string; firstName: string | null; lastName: string | null; email: string | null } }>> {
    return this.prisma.compensationRate.findMany({
      where: { effectiveTo: null },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { effectiveFrom: 'desc' },
    });
  }
}

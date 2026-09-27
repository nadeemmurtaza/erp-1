import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { EventBusService } from '../../core/events/event-bus.service';
import { DomainEvent } from '../../core/events/domain-events';
import { AuditService } from '../../core/audit/audit.service';
import type { Bank, BankFacility, BankFacilityDrawdown, BankFacilityRepayment, BankFacilityStatus } from '../../core/prisma/client';
import { CreateBankDto, CreateBankFacilityDto, RecordDrawdownDto, RecordRepaymentDto } from './dto/bank-facility.dto';

function startOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

export interface BankFacilityWithUtilization extends BankFacility {
  bank: Bank;
  utilizedMinor: number;
}

/**
 * The business's own borrowing against a bank facility limit
 * (finance-accounting/167-bank-facility-management.md) — the mirror
 * concern to `receivables` (what the business is owed): what the business
 * itself owes a bank. Utilization is never a stored, driftable counter —
 * `utilizationOf()` sums posted drawdowns minus repaid principal at read
 * time, the same discipline doc 150's `bundleAvailableStock()` already
 * applies. `bankfacilities` never imports `accounting`: every posting
 * publishes a domain event `posting-rules.subscriber.ts` handles, the
 * identical decoupling `settlements`/`receivables` already establish.
 */
@Injectable()
export class BankFacilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
  ) {}

  async createBank(dto: CreateBankDto): Promise<Bank> {
    return this.prisma.bank.create({ data: { name: dto.name } });
  }

  async listBanks(): Promise<Bank[]> {
    return this.prisma.bank.findMany({ orderBy: { name: 'asc' } });
  }

  async createFacility(dto: CreateBankFacilityDto): Promise<BankFacility> {
    const bank = await this.prisma.bank.findUnique({ where: { id: dto.bankId } });
    if (!bank) throw new NotFoundException('Bank not found.');

    if (new Date(dto.maturityDate) <= new Date(dto.startDate)) {
      throw new BadRequestException('maturityDate must be after startDate.');
    }

    return this.prisma.bankFacility.create({
      data: {
        bankId: dto.bankId,
        key: dto.key,
        label: dto.label,
        facilityType: dto.facilityType,
        limitMinor: dto.limitMinor,
        markupRateBps: dto.markupRateBps,
        isFloatingRate: dto.isFloatingRate ?? false,
        securityReference: dto.securityReference,
        startDate: new Date(dto.startDate),
        maturityDate: new Date(dto.maturityDate),
      },
    });
  }

  /** Posted drawdowns minus repaid principal — never a maintained counter. */
  async utilizationOf(facilityId: string): Promise<number> {
    const [drawdowns, repayments] = await Promise.all([
      this.prisma.bankFacilityDrawdown.aggregate({ where: { facilityId, postedAt: { not: null } }, _sum: { amountMinor: true } }),
      this.prisma.bankFacilityRepayment.aggregate({ where: { facilityId }, _sum: { principalMinor: true } }),
    ]);
    return (drawdowns._sum.amountMinor ?? 0) - (repayments._sum.principalMinor ?? 0);
  }

  async listFacilities(status?: BankFacilityStatus): Promise<BankFacilityWithUtilization[]> {
    const facilities = await this.prisma.bankFacility.findMany({
      where: status ? { status } : undefined,
      include: { bank: true },
      orderBy: { maturityDate: 'asc' },
    });
    return Promise.all(
      facilities.map(async (facility) => ({ ...facility, utilizedMinor: await this.utilizationOf(facility.id) })),
    );
  }

  /**
   * "Renewal/covenant tracking" — computed at read time from `maturityDate`,
   * never a stored, driftable flag, the same discipline doc 56's overdue-
   * invoices counter already applies to a different kind of deadline.
   */
  async listUpcomingRenewals(): Promise<BankFacilityWithUtilization[]> {
    const alertDays = await this.settings.get<number>(SettingKey.FinanceFacilityRenewalAlertDays);
    const horizon = new Date(Date.now() + alertDays * 24 * 60 * 60 * 1000);
    const facilities = await this.prisma.bankFacility.findMany({
      where: { status: 'ACTIVE', maturityDate: { lte: horizon } },
      include: { bank: true },
      orderBy: { maturityDate: 'asc' },
    });
    return Promise.all(
      facilities.map(async (facility) => ({ ...facility, utilizedMinor: await this.utilizationOf(facility.id) })),
    );
  }

  async getFacility(id: string): Promise<BankFacilityWithUtilization> {
    const facility = await this.prisma.bankFacility.findUnique({
      where: { id },
      include: {
        bank: true,
        drawdowns: { orderBy: { createdAt: 'desc' } },
        repayments: { orderBy: { createdAt: 'desc' } },
        accruals: { orderBy: { periodStart: 'desc' } },
      },
    });
    if (!facility) throw new NotFoundException('Bank facility not found.');
    return { ...facility, utilizedMinor: await this.utilizationOf(id) };
  }

  /**
   * "Utilization and limit-breach alerts" — refused outright before an
   * over-limit drawdown is ever recorded, never discovered after the fact.
   * At or below the configured threshold, posts immediately; above it,
   * needs `approveDrawdown()` first, by someone other than the requester —
   * the identical shape `CreditNotesService.create()`/`.approve()`/
   * `.issue()` already establishes.
   */
  async recordDrawdown(facilityId: string, dto: RecordDrawdownDto, actorId: string): Promise<BankFacilityDrawdown> {
    const facility = await this.prisma.bankFacility.findUnique({ where: { id: facilityId } });
    if (!facility) throw new NotFoundException('Bank facility not found.');
    if (facility.status !== 'ACTIVE') throw new ConflictException('This facility is not active.');

    const utilized = await this.utilizationOf(facilityId);
    if (utilized + dto.amountMinor > facility.limitMinor) {
      throw new BadRequestException(
        `This drawdown would take utilization to ${utilized + dto.amountMinor}, over the facility's own limit of ${facility.limitMinor}.`,
      );
    }

    const threshold = await this.settings.get<number>(SettingKey.FinanceFacilityDrawdownApprovalThresholdMinor);
    const drawdown = await this.prisma.bankFacilityDrawdown.create({
      data: {
        facilityId,
        amountMinor: dto.amountMinor,
        drawdownDate: new Date(dto.drawdownDate),
        note: dto.note,
        createdById: actorId,
      },
    });

    if (dto.amountMinor <= threshold) {
      return this.postDrawdown(drawdown.id, actorId);
    }
    return drawdown;
  }

  /** "The threshold nobody approves alone" — never the requester's own approval. */
  async approveDrawdown(id: string, actorId: string): Promise<BankFacilityDrawdown> {
    return this.prisma.$transaction(async (tx) => {
      const drawdown = await tx.bankFacilityDrawdown.findUnique({ where: { id } });
      if (!drawdown) throw new NotFoundException('Drawdown not found.');
      if (drawdown.createdById === actorId) {
        throw new ForbiddenException('The requester of a drawdown cannot approve their own.');
      }
      if (drawdown.postedAt) throw new ConflictException('This drawdown has already posted.');
      return tx.bankFacilityDrawdown.update({ where: { id }, data: { approvedById: actorId } });
    });
  }

  /**
   * Posts the drawdown — refused above the threshold without a prior,
   * different approver, enforced again here, never trusted from the
   * approval step alone.
   */
  async postDrawdown(id: string, actorId: string): Promise<BankFacilityDrawdown> {
    const threshold = await this.settings.get<number>(SettingKey.FinanceFacilityDrawdownApprovalThresholdMinor);

    return this.prisma.$transaction(async (tx) => {
      const drawdown = await tx.bankFacilityDrawdown.findUnique({ where: { id } });
      if (!drawdown) throw new NotFoundException('Drawdown not found.');
      if (drawdown.postedAt) throw new ConflictException('This drawdown has already posted.');

      if (drawdown.amountMinor > threshold) {
        if (!drawdown.approvedById) {
          throw new ForbiddenException(`A drawdown over ${threshold} paisa needs finance.facilities.approve_drawdown before it can post.`);
        }
        if (drawdown.approvedById === drawdown.createdById) {
          throw new ForbiddenException('The requester of a drawdown cannot approve or post their own above-threshold drawdown alone.');
        }
      }

      const postedAt = new Date();
      const posted = await tx.bankFacilityDrawdown.update({ where: { id }, data: { postedAt } });

      await this.events.publish(
        DomainEvent.BankFacilityDrawdownPosted,
        { drawdownId: posted.id, facilityId: posted.facilityId, amountMinor: posted.amountMinor, drawdownDate: posted.drawdownDate.toISOString() },
        tx,
      );

      await this.audit.record({
        actorId,
        action: 'bank_facility.drawdown_posted',
        entity: 'BankFacilityDrawdown',
        entityId: posted.id,
        data: { amountMinor: posted.amountMinor, facilityId: posted.facilityId },
      });

      return posted;
    });
  }

  /**
   * A repayment against principal, accrued markup, or both — posts
   * immediately, the same "record" shape a settlement confirmation already
   * uses: the bank has, in fact, already been repaid this amount.
   */
  async recordRepayment(facilityId: string, dto: RecordRepaymentDto, actorId: string): Promise<BankFacilityRepayment> {
    const principalMinor = dto.principalMinor ?? 0;
    const markupMinor = dto.markupMinor ?? 0;
    if (principalMinor <= 0 && markupMinor <= 0) {
      throw new BadRequestException('A repayment needs a positive principalMinor, markupMinor, or both.');
    }

    const facility = await this.prisma.bankFacility.findUnique({ where: { id: facilityId } });
    if (!facility) throw new NotFoundException('Bank facility not found.');

    return this.prisma.$transaction(async (tx) => {
      const repayment = await tx.bankFacilityRepayment.create({
        data: {
          facilityId,
          principalMinor,
          markupMinor,
          repaymentDate: new Date(dto.repaymentDate),
          note: dto.note,
          createdById: actorId,
        },
      });

      await this.events.publish(
        DomainEvent.BankFacilityRepaymentRecorded,
        {
          repaymentId: repayment.id,
          facilityId,
          principalMinor,
          markupMinor,
          repaymentDate: repayment.repaymentDate.toISOString(),
        },
        tx,
      );

      return repayment;
    });
  }

  /**
   * The monthly markup-accrual cron's own body — one row per facility per
   * calendar month, idempotent via `@@unique([facilityId, periodStart])`,
   * the identical shape `AssetDepreciationService.postMonthlyDepreciation()`
   * already establishes for a different periodic liability.
   */
  async postMonthlyMarkupAccruals(): Promise<{ posted: number; skipped: number }> {
    const now = new Date();
    const periodStart = startOfMonthUTC(now);
    const periodEnd = endOfMonthUTC(now);

    const facilities = await this.prisma.bankFacility.findMany({ where: { status: 'ACTIVE', startDate: { lte: periodEnd } } });

    let posted = 0;
    let skipped = 0;
    for (const facility of facilities) {
      const existing = await this.prisma.bankFacilityMarkupAccrual.findUnique({
        where: { facilityId_periodStart: { facilityId: facility.id, periodStart } },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      const outstandingMinor = await this.utilizationOf(facility.id);
      const amountMinor = Math.floor((outstandingMinor * facility.markupRateBps) / 10_000 / 12);
      if (amountMinor <= 0) {
        skipped += 1;
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.bankFacilityMarkupAccrual.create({ data: { facilityId: facility.id, periodStart, periodEnd, amountMinor } });
        await this.events.publish(
          DomainEvent.BankFacilityMarkupAccrued,
          { facilityId: facility.id, amountMinor, periodEnd: periodEnd.toISOString() },
          tx,
        );
      });
      posted += 1;
    }

    return { posted, skipped };
  }
}

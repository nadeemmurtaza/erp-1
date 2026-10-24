import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { Asset, AssetDepreciationSchedule, DepreciationMethod } from '../../../core/prisma/client';
import { AccountingService } from './accounting.service';
import { ACCOUNT_CODE } from './chart-of-accounts';
import { CreateDepreciationScheduleDto } from './dto/asset-depreciation.dto';

/** "2026-09" — the calendar month a date falls in, UTC. */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function startOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function endOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

/** Whole calendar months between two UTC month-starts — 0 for the same month. */
export function monthsBetweenUTC(from: Date, to: Date): number {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
}

export interface DepreciationInput {
  method: DepreciationMethod;
  acquisitionCostMinor: number;
  salvageValueMinor: number;
  usefulLifeMonths: number;
  decliningRateBps: number | null;
}

/**
 * Pure: schedule + how many months have already elapsed since `startDate` +
 * how much has already been posted, in — this month's depreciation amount,
 * out. No `prisma.` read, no write, callable in a loop for a 12-month
 * preview with no posting side effect (147-fixed-asset-depreciation.md's own
 * "Dry run before live" lens).
 *
 * Clamped so book value (acquisitionCostMinor - totalPostedSoFarMinor) never
 * drops below salvageValueMinor, and a fully-depreciated schedule returns 0
 * rather than a negative or a phantom positive amount — the acceptance
 * criterion this document names explicitly.
 */
export function monthlyDepreciation(
  schedule: DepreciationInput,
  monthsElapsed: number,
  totalPostedSoFarMinor: number,
): number {
  const remainingBookValue = schedule.acquisitionCostMinor - totalPostedSoFarMinor;
  const remainingDepreciable = remainingBookValue - schedule.salvageValueMinor;
  if (remainingDepreciable <= 0) return 0;

  if (schedule.method === 'STRAIGHT_LINE') {
    if (monthsElapsed >= schedule.usefulLifeMonths) return 0;
    const depreciableBase = schedule.acquisitionCostMinor - schedule.salvageValueMinor;
    const flat = Math.floor(depreciableBase / schedule.usefulLifeMonths);
    return Math.max(0, Math.min(flat, remainingDepreciable));
  }

  // DECLINING_BALANCE
  const rate = schedule.decliningRateBps ?? 0;
  const raw = Math.floor((remainingBookValue * rate) / 10_000);
  return Math.max(0, Math.min(raw, remainingDepreciable));
}

/**
 * Book depreciation for hr.prisma's `Asset`
 * (finance-accounting/147-fixed-asset-depreciation.md) — doc 79's own named,
 * deferred gap. Reads/writes `Asset` by its bare Prisma model rather than
 * importing `hr`'s `AssetsService`, the same "core data, no module import"
 * shape `PostingRulesSubscriber` already uses for `Order` — `accounting`
 * still imports no other module.
 */
@Injectable()
export class AssetDepreciationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  async getSchedule(assetId: string) {
    return this.prisma.assetDepreciationSchedule.findUnique({
      where: { assetId },
      include: { postings: { orderBy: { periodStart: 'asc' } } },
    });
  }

  async createSchedule(
    assetId: string,
    dto: CreateDepreciationScheduleDto,
    actorId: string,
  ): Promise<AssetDepreciationSchedule> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('No such asset.');

    const existing = await this.prisma.assetDepreciationSchedule.findUnique({ where: { assetId } });
    if (existing && !existing.closedAt) {
      throw new ConflictException('This asset already has an active depreciation schedule.');
    }

    const acquisitionCostMinor = dto.acquisitionCostMinor ?? asset.purchaseCostMinor ?? undefined;
    if (acquisitionCostMinor === undefined) {
      throw new BadRequestException(
        'This asset has no recorded purchase cost — pass acquisitionCostMinor explicitly.',
      );
    }
    const salvageValueMinor = dto.salvageValueMinor ?? 0;
    if (salvageValueMinor > acquisitionCostMinor) {
      throw new BadRequestException('salvageValueMinor cannot exceed acquisitionCostMinor.');
    }
    if (dto.method === 'DECLINING_BALANCE' && !dto.decliningRateBps) {
      throw new BadRequestException('decliningRateBps is required for DECLINING_BALANCE.');
    }

    return this.prisma.assetDepreciationSchedule.create({
      data: {
        assetId,
        method: dto.method,
        acquisitionCostMinor,
        salvageValueMinor,
        usefulLifeMonths: dto.usefulLifeMonths,
        decliningRateBps: dto.method === 'DECLINING_BALANCE' ? dto.decliningRateBps : null,
        startDate: new Date(dto.startDate),
        createdById: actorId,
      },
    });
  }

  /**
   * A pure preview across `months` periods from the schedule's own
   * `startDate` — no write, no posting, what the UI calls to show "what
   * this schedule will post" before it exists.
   */
  previewSchedule(schedule: DepreciationInput, months: number): number[] {
    const amounts: number[] = [];
    let totalPosted = 0;
    for (let i = 0; i < months; i += 1) {
      const amount = monthlyDepreciation(schedule, i, totalPosted);
      amounts.push(amount);
      totalPosted += amount;
    }
    return amounts;
  }

  /**
   * The monthly cron's own body (`AssetDepreciationCron`) — posts every
   * active schedule's depreciation for the current calendar month, through
   * the identical `findPostedEntry()` idempotency key every other posting
   * rule in this repository already uses, so a re-run this month is a
   * guaranteed no-op.
   */
  async postMonthlyDepreciation(): Promise<{ posted: number; skipped: number }> {
    const now = new Date();
    const periodStart = startOfMonthUTC(now);
    const periodEnd = endOfMonthUTC(now);
    const key = monthKey(now);

    const schedules = await this.prisma.assetDepreciationSchedule.findMany({
      where: { closedAt: null, startDate: { lte: periodEnd } },
      include: { postings: true },
    });

    const accountIds = await this.accounting.accountIdsByCode([
      ACCOUNT_CODE.DEPRECIATION_EXPENSE,
      ACCOUNT_CODE.ACCUMULATED_DEPRECIATION,
    ]);
    const depreciationExpenseId = accountIds.get(ACCOUNT_CODE.DEPRECIATION_EXPENSE);
    const accumulatedDepreciationId = accountIds.get(ACCOUNT_CODE.ACCUMULATED_DEPRECIATION);
    if (!depreciationExpenseId || !accumulatedDepreciationId) {
      throw new BadRequestException('Chart of accounts is missing Depreciation Expense or Accumulated Depreciation.');
    }

    let posted = 0;
    let skipped = 0;
    for (const schedule of schedules) {
      const sourceRef = `${schedule.id}:${key}`;
      const alreadyPosted = await this.accounting.findPostedEntry('AssetDepreciation', sourceRef);
      if (alreadyPosted) {
        skipped += 1;
        continue;
      }

      const totalPostedSoFar = schedule.postings.reduce((sum, p) => sum + p.amountMinor, 0);
      const monthsElapsed = monthsBetweenUTC(startOfMonthUTC(schedule.startDate), periodStart);
      const amount = monthlyDepreciation(schedule, monthsElapsed, totalPostedSoFar);
      if (amount === 0) {
        skipped += 1;
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        await this.accounting.postEntry(
          {
            date: periodEnd,
            source: 'AssetDepreciation',
            sourceRef,
            memo: `Depreciation for asset ${schedule.assetId}, ${key}`,
            lines: [
              { accountId: depreciationExpenseId, debitMinor: amount },
              { accountId: accumulatedDepreciationId, creditMinor: amount },
            ],
          },
          tx,
        );
        await tx.assetDepreciationPosting.create({
          data: { scheduleId: schedule.id, periodStart, periodEnd, amountMinor: amount },
        });
      });
      posted += 1;
    }

    return { posted, skipped };
  }

  /**
   * Write-off with a GL posting — distinct from doc 79's own `writeOff()`
   * (a pure custody-status change with no accounting entry). Requires an
   * active depreciation schedule: an asset never put on a schedule has
   * nothing for this method to reconcile and is doc 79's `writeOff()`'s own
   * case instead.
   */
  async disposeAsset(
    assetId: string,
    disposalDate: Date,
    saleProceedsMinor: number,
    actorId: string,
  ): Promise<{ asset: Asset; lossMinor: number; gainMinor: number }> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('No such asset.');
    if (asset.status === 'RETIRED' || asset.status === 'LOST') {
      throw new BadRequestException(`${asset.assetTag} is already ${asset.status}.`);
    }

    const schedule = await this.prisma.assetDepreciationSchedule.findUnique({
      where: { assetId },
      include: { postings: true },
    });
    if (!schedule || schedule.closedAt) {
      throw new BadRequestException(
        'This asset has no active depreciation schedule — use the ordinary write-off action instead.',
      );
    }

    const totalPostedSoFar = schedule.postings.reduce((sum, p) => sum + p.amountMinor, 0);
    const remainingBookValue = Math.max(0, schedule.acquisitionCostMinor - totalPostedSoFar);

    const accountIds = await this.accounting.accountIdsByCode([
      ACCOUNT_CODE.ACCUMULATED_DEPRECIATION,
      ACCOUNT_CODE.CASH_AND_BANK,
      ACCOUNT_CODE.GAIN_ON_DISPOSAL,
      ACCOUNT_CODE.LOSS_ON_DISPOSAL,
    ]);

    const lines: { accountId: string; debitMinor?: number; creditMinor?: number }[] = [];
    if (remainingBookValue > 0) {
      lines.push({ accountId: accountIds.get(ACCOUNT_CODE.LOSS_ON_DISPOSAL)!, debitMinor: remainingBookValue });
      lines.push({ accountId: accountIds.get(ACCOUNT_CODE.ACCUMULATED_DEPRECIATION)!, creditMinor: remainingBookValue });
    }
    if (saleProceedsMinor > 0) {
      lines.push({ accountId: accountIds.get(ACCOUNT_CODE.CASH_AND_BANK)!, debitMinor: saleProceedsMinor });
      lines.push({ accountId: accountIds.get(ACCOUNT_CODE.GAIN_ON_DISPOSAL)!, creditMinor: saleProceedsMinor });
    }

    return this.prisma.$transaction(async (tx) => {
      if (lines.length > 0) {
        await this.accounting.postEntry(
          {
            date: disposalDate,
            source: 'AssetDisposal',
            sourceRef: schedule.id,
            memo: `Disposal of asset ${asset.assetTag}`,
            lines,
          },
          tx,
        );
      }

      await tx.assetDepreciationSchedule.update({ where: { id: schedule.id }, data: { closedAt: new Date() } });
      // The asset leaves the books entirely — any open custody assignment
      // closes with it, the same way doc 79's own writeOff() already closes
      // one, rather than leaving a disposed asset showing as "held by"
      // someone.
      await tx.assetAssignment.updateMany({
        where: { assetId, returnedAt: null },
        data: { returnedAt: new Date(), returnedById: actorId, condition: 'Disposed' },
      });
      const updated = await tx.asset.update({ where: { id: assetId }, data: { status: 'RETIRED' } });

      return { asset: updated, lossMinor: remainingBookValue, gainMinor: saleProceedsMinor };
    });
  }
}

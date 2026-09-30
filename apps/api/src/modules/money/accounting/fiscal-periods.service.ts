import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { FiscalPeriod, FiscalYear } from '../../../core/prisma/client';
import { CreateFiscalPeriodDto, CreateFiscalYearDto } from './dto/fiscal-period.dto';
import { AccountingService, type PostLineInput } from './accounting.service';
import { GlReportsService } from './gl-reports.service';
import { ACCOUNT_CODE } from './chart-of-accounts';

/**
 * Opens, closes and locks fiscal periods (RETAIL-ERP.md R15, WO-19.5).
 *
 * The late-fact rule — "nothing posts into a LOCKED period; a late fact
 * posts to whatever period is currently OPEN instead" — needed no new code
 * here: `AccountingService.resolveOpenPeriod()` already only ever considers
 * `status: 'OPEN'` periods (WO-19.1), so a CLOSED or LOCKED period is
 * already unreachable for a new posting the moment its status changes. This
 * service is the missing other half: nothing before it could ever CREATE a
 * `FiscalYear`/`FiscalPeriod` or MOVE one between statuses outside a raw
 * Prisma call in a test fixture.
 *
 * CLOSED is a soft boundary and reopenable — a bookkeeping mistake caught a
 * day later shouldn't need a reversing entry just to fix a fat-fingered
 * close. LOCKED is not: it requires CLOSED first (an explicit two-step
 * gate, not skippable from OPEN) and, once locked, stays locked — matching
 * the same "facts, once posted, do not un-happen" discipline as a
 * `JournalEntry` itself (R2).
 */
@Injectable()
export class FiscalPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly glReports: GlReportsService,
  ) {}

  async listFiscalYears(): Promise<FiscalYear[]> {
    return this.prisma.fiscalYear.findMany({ orderBy: { startsOn: 'desc' } });
  }

  async listPeriods(fiscalYearId?: string): Promise<FiscalPeriod[]> {
    return this.prisma.fiscalPeriod.findMany({
      where: fiscalYearId ? { fiscalYearId } : undefined,
      orderBy: { startsOn: 'asc' },
    });
  }

  async createFiscalYear(dto: CreateFiscalYearDto): Promise<FiscalYear> {
    const startsOn = new Date(dto.startsOn);
    const endsOn = new Date(dto.endsOn);
    if (startsOn >= endsOn) {
      throw new BadRequestException('startsOn must be before endsOn.');
    }

    const existing = await this.prisma.fiscalYear.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(`A fiscal year named "${dto.name}" already exists.`);
    }

    return this.prisma.fiscalYear.create({ data: { name: dto.name, startsOn, endsOn } });
  }

  async createFiscalPeriod(dto: CreateFiscalPeriodDto): Promise<FiscalPeriod> {
    const fiscalYear = await this.prisma.fiscalYear.findUnique({ where: { id: dto.fiscalYearId } });
    if (!fiscalYear) throw new NotFoundException('Fiscal year not found.');

    const startsOn = new Date(dto.startsOn);
    const endsOn = new Date(dto.endsOn);
    if (startsOn >= endsOn) {
      throw new BadRequestException('startsOn must be before endsOn.');
    }
    if (startsOn < fiscalYear.startsOn || endsOn > fiscalYear.endsOn) {
      throw new BadRequestException(
        `${dto.name} must fall within its fiscal year (${fiscalYear.name}: ${fiscalYear.startsOn.toISOString().slice(0, 10)} to ${fiscalYear.endsOn.toISOString().slice(0, 10)}).`,
      );
    }

    const existing = await this.prisma.fiscalPeriod.findUnique({
      where: { fiscalYearId_name: { fiscalYearId: dto.fiscalYearId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException(`Period "${dto.name}" already exists in ${fiscalYear.name}.`);
    }

    return this.prisma.fiscalPeriod.create({
      data: { fiscalYearId: dto.fiscalYearId, name: dto.name, startsOn, endsOn },
    });
  }

  async closePeriod(id: string): Promise<FiscalPeriod> {
    const period = await this.findPeriodOrThrow(id);
    if (period.status !== 'OPEN') {
      throw new BadRequestException(`Period ${period.name} is ${period.status}, not OPEN — only an OPEN period can be closed.`);
    }
    return this.prisma.fiscalPeriod.update({ where: { id }, data: { status: 'CLOSED' } });
  }

  async reopenPeriod(id: string): Promise<FiscalPeriod> {
    const period = await this.findPeriodOrThrow(id);
    if (period.status !== 'CLOSED') {
      throw new BadRequestException(
        period.status === 'LOCKED'
          ? `Period ${period.name} is LOCKED — a locked period can never be reopened.`
          : `Period ${period.name} is already OPEN.`,
      );
    }
    return this.prisma.fiscalPeriod.update({ where: { id }, data: { status: 'OPEN' } });
  }

  async lockPeriod(id: string): Promise<FiscalPeriod> {
    const period = await this.findPeriodOrThrow(id);
    if (period.status !== 'CLOSED') {
      throw new BadRequestException(`Period ${period.name} must be CLOSED before it can be locked — lock is permanent.`);
    }
    return this.prisma.fiscalPeriod.update({ where: { id }, data: { status: 'LOCKED' } });
  }

  /**
   * The year-end close: zeros every INCOME/EXPENSE account's activity for
   * the fiscal year into `Retained Earnings` (3000) with one balancing
   * journal entry, then marks `FiscalYear.closedAt` — both in the same
   * transaction, via `AccountingService.postEntry()`'s `tx` param, so a
   * failure never leaves a posted closing entry with the year still reading
   * open (which would let a retry post a second one and double-zero the
   * year's P&L). Requires every period in the year to already be CLOSED or
   * LOCKED — closing the year while one still takes postings would let a
   * fact land after its own year has already been swept into equity.
   */
  async closeFiscalYear(id: string): Promise<FiscalYear> {
    const fiscalYear = await this.prisma.fiscalYear.findUnique({ where: { id } });
    if (!fiscalYear) throw new NotFoundException('Fiscal year not found.');
    if (fiscalYear.closedAt) {
      throw new BadRequestException(`${fiscalYear.name} is already closed.`);
    }

    const periods = await this.prisma.fiscalPeriod.findMany({ where: { fiscalYearId: id } });
    const stillOpen = periods.filter((p) => p.status === 'OPEN');
    if (stillOpen.length > 0) {
      throw new BadRequestException(
        `Close every period in ${fiscalYear.name} first — still OPEN: ${stillOpen.map((p) => p.name).join(', ')}.`,
      );
    }

    const { income, expense, netIncomeMinor } = await this.glReports.profitAndLoss(
      fiscalYear.startsOn,
      fiscalYear.endsOn,
    );

    const lines: PostLineInput[] = [];
    for (const row of income) {
      if (row.amountMinor === 0) continue;
      lines.push({ accountId: row.accountId, debitMinor: row.amountMinor });
    }
    for (const row of expense) {
      if (row.amountMinor === 0) continue;
      lines.push({ accountId: row.accountId, creditMinor: row.amountMinor });
    }

    if (lines.length > 0 && netIncomeMinor !== 0) {
      const retainedEarnings = await this.prisma.account.findUnique({
        where: { code: ACCOUNT_CODE.RETAINED_EARNINGS },
      });
      if (!retainedEarnings) {
        throw new BadRequestException('The Retained Earnings (3000) account is missing — has the chart of accounts been seeded?');
      }
      if (netIncomeMinor > 0) {
        lines.push({ accountId: retainedEarnings.id, creditMinor: netIncomeMinor });
      } else {
        lines.push({ accountId: retainedEarnings.id, debitMinor: -netIncomeMinor });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (lines.length > 0) {
        await this.accounting.postEntry(
          {
            date: fiscalYear.endsOn,
            source: 'accounting.year_end_close',
            sourceRef: fiscalYear.id,
            memo: `Year-end close: ${fiscalYear.name}`,
            lines,
          },
          tx,
        );
      }

      return tx.fiscalYear.update({ where: { id }, data: { closedAt: new Date() } });
    });
  }

  private async findPeriodOrThrow(id: string): Promise<FiscalPeriod> {
    const period = await this.prisma.fiscalPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundException('Fiscal period not found.');
    return period;
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { CashMovement, PosShift } from '../../core/prisma/client';
import type { CashMovementTypeDto } from './dto/pos-shift.dto';

export interface CashBreakdown {
  expectedCashMinor: number;
  openingFloatMinor: number;
  cashInMinor: number;
  cashOutMinor: number;
  dropMinor: number;
  paidOutMinor: number;
}

/**
 * Shift lifecycle and cash movements (RETAIL-ERP.md R11, WO-21.2) — a
 * cashier opens a shift with a float, the drawer's cash moves during it,
 * and closing it compares the cashier's own physical count against what
 * the recorded movements say should be there.
 *
 * X/Z reporting here is cash-only: nothing posts a SALE through `pos` yet
 * (WO-21.3's `pos -> orders` hand-off doesn't exist). Once it does, a real
 * report needs sales/tender totals folded in alongside this cash
 * breakdown — a change to make then, not something faked here by pretending
 * a cash-only report is the whole picture today.
 */
@Injectable()
export class PosShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  async openShift(terminalId: string, openedByUserId: string, openingCashMinor: number): Promise<PosShift> {
    const terminal = await this.prisma.posTerminal.findUnique({ where: { id: terminalId } });
    if (!terminal) throw new NotFoundException('Terminal not found');
    if (terminal.status !== 'ACTIVE') {
      throw new BadRequestException(`Terminal ${terminal.code} is ${terminal.status}, not ACTIVE — cannot open a shift on it.`);
    }

    const alreadyOpen = await this.prisma.posShift.findFirst({ where: { terminalId, status: 'OPEN' } });
    if (alreadyOpen) {
      throw new BadRequestException(`Terminal ${terminal.code} already has an open shift — close it first.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.posShift.create({
        data: { terminalId, openedByUserId, openingCashMinor },
      });
      await tx.cashMovement.create({
        data: { shiftId: shift.id, type: 'OPENING_FLOAT', amountMinor: openingCashMinor, actorId: openedByUserId },
      });
      return shift;
    });
  }

  async recordCashMovement(
    shiftId: string,
    type: CashMovementTypeDto,
    amountMinor: number,
    reason: string | undefined,
    actorId: string,
  ): Promise<CashMovement> {
    const shift = await this.findShiftOrThrow(shiftId);
    if (shift.status !== 'OPEN') {
      throw new BadRequestException('This shift is already closed — cash movements only post to an open shift.');
    }

    return this.prisma.cashMovement.create({
      data: { shiftId, type, amountMinor, reason, actorId },
    });
  }

  async closeShift(shiftId: string, closedByUserId: string, closingCashMinor: number): Promise<PosShift> {
    const shift = await this.findShiftOrThrow(shiftId);
    if (shift.status !== 'OPEN') {
      throw new BadRequestException('This shift is already closed.');
    }

    return this.prisma.posShift.update({
      where: { id: shiftId },
      data: { status: 'CLOSED', closingCashMinor, closedByUserId, closedAt: new Date() },
    });
  }

  /** A mid-shift snapshot — callable on an OPEN or CLOSED shift, never mutates anything. */
  async xReport(shiftId: string): Promise<CashBreakdown> {
    await this.findShiftOrThrow(shiftId);
    const movements = await this.prisma.cashMovement.findMany({ where: { shiftId } });
    return this.breakdown(movements);
  }

  /** The end-of-shift figure — only once the shift is CLOSED, so "over/short" compares against a physical count that actually happened. */
  async zReport(shiftId: string): Promise<CashBreakdown & { closingCashMinor: number; overShortMinor: number }> {
    const shift = await this.findShiftOrThrow(shiftId);
    if (shift.status !== 'CLOSED' || shift.closingCashMinor === null) {
      throw new BadRequestException('The Z-report is only available once the shift is closed.');
    }

    const movements = await this.prisma.cashMovement.findMany({ where: { shiftId } });
    const breakdown = this.breakdown(movements);
    return {
      ...breakdown,
      closingCashMinor: shift.closingCashMinor,
      overShortMinor: shift.closingCashMinor - breakdown.expectedCashMinor,
    };
  }

  private breakdown(movements: CashMovement[]): CashBreakdown {
    const sums = { openingFloatMinor: 0, cashInMinor: 0, cashOutMinor: 0, dropMinor: 0, paidOutMinor: 0 };
    for (const m of movements) {
      switch (m.type) {
        case 'OPENING_FLOAT':
          sums.openingFloatMinor += m.amountMinor;
          break;
        case 'CASH_IN':
          sums.cashInMinor += m.amountMinor;
          break;
        case 'CASH_OUT':
          sums.cashOutMinor += m.amountMinor;
          break;
        case 'DROP':
          sums.dropMinor += m.amountMinor;
          break;
        case 'PAID_OUT':
          sums.paidOutMinor += m.amountMinor;
          break;
      }
    }
    const expectedCashMinor =
      sums.openingFloatMinor + sums.cashInMinor - sums.cashOutMinor - sums.dropMinor - sums.paidOutMinor;
    return { expectedCashMinor, ...sums };
  }

  private async findShiftOrThrow(id: string): Promise<PosShift> {
    const shift = await this.prisma.posShift.findUnique({ where: { id } });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }
}

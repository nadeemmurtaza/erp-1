import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { StockVariance } from '../../../core/prisma/client';

/**
 * The oversell exception queue (RETAIL-ERP.md R5) — one row per StockMovement
 * that InventoryService.postUnconditional() let go negative. `resolve()` is a
 * manual, audited acknowledgement (a manager has seen it, counted the shelf,
 * or written it off some other way); it does not move stock or reverse the
 * shrinkage journal (R15's posting rule already booked it, permanently).
 */
@Injectable()
export class StockVarianceService {
  constructor(private readonly prisma: PrismaService) {}

  async listOpen(): Promise<StockVariance[]> {
    return this.prisma.stockVariance.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
      include: { variant: { select: { id: true, sku: true, label: true } }, location: { select: { id: true, name: true, code: true } } },
    });
  }

  /**
   * By shift, for a branch's own accountability history —
   * 156-single-employee-branch-loss-prevention.md §1: "every variance opened
   * while this specific employee had the till open."
   */
  async listByShift(locationId?: string) {
    return this.prisma.stockVariance.findMany({
      where: { locationId, posShiftId: { not: null } },
      orderBy: { createdAt: 'desc' },
      include: {
        variant: { select: { id: true, sku: true, label: true } },
        location: { select: { id: true, name: true, code: true } },
        posShift: { select: { id: true, openedByUserId: true, closedByUserId: true, openedAt: true, closedAt: true, status: true } },
      },
    });
  }

  /**
   * 156-single-employee-branch-loss-prevention.md §2: the identical
   * toxic-pair refusal this repository already applies elsewhere
   * (closeShift() vs. openedByUserId, doc 63's self-approval refusal). At a
   * genuinely single-employee branch this means that employee cannot clear
   * their own variance at all — resolution requires someone else.
   */
  async resolve(id: string, resolvedByUserId: string, resolutionNote?: string): Promise<StockVariance> {
    const existing = await this.prisma.stockVariance.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Stock variance not found.');

    if (existing.posShiftId) {
      const shift = await this.prisma.posShift.findUniqueOrThrow({ where: { id: existing.posShiftId } });
      if (shift.openedByUserId === resolvedByUserId || shift.closedByUserId === resolvedByUserId) {
        throw new ForbiddenException('The employee whose shift is linked to this variance cannot resolve it themselves.');
      }
    }

    return this.prisma.stockVariance.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedByUserId,
        resolutionNote: resolutionNote?.trim() || null,
      },
    });
  }
}

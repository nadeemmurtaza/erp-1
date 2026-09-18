import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { StockVariance } from '../../core/prisma/client';

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

  async resolve(id: string, resolvedByUserId: string, resolutionNote?: string): Promise<StockVariance> {
    const existing = await this.prisma.stockVariance.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Stock variance not found.');

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

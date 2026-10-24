import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

export interface LeadTimeDistribution {
  meanDays: number;
  stdDevDays: number;
  observationCount: number;
}

export interface SupplierScorecard {
  otifPct: number;
  priceVariancePct: number;
  /** Null — no quality/defect/return-to-supplier field exists anywhere in this schema today; never fabricated, per R25's own "never invented, never guessed" (see this document's own DECISIONS.md entry). */
  defectRatePct: null;
}

const MIN_OBSERVATIONS_FOR_DISTRIBUTION = 3;

/**
 * R25 — lead time as a distribution, and a scorecard, both backfilled from
 * history already in the database — "none requiring anyone to type
 * anything new," per this document's own words.
 */
@Injectable()
export class SupplierResilienceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Records one lead-time observation for a goods receipt — the listener's own body, in `planning.module.ts`. */
  async recordObservation(supplierId: string, purchaseOrderId: string, observedDays: number): Promise<void> {
    if (observedDays < 0) return;
    await this.prisma.supplierLeadTimeObservation.create({ data: { supplierId, purchaseOrderId, observedDays } });
  }

  /** Falls back to the existing `Supplier.leadTimeDays` scalar when too few observations exist — R25's own explicit fallback rule. */
  async leadTimeDistribution(supplierId: string): Promise<LeadTimeDistribution> {
    const observations = await this.prisma.supplierLeadTimeObservation.findMany({
      where: { supplierId },
      select: { observedDays: true },
    });

    if (observations.length < MIN_OBSERVATIONS_FOR_DISTRIBUTION) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { leadTimeDays: true } });
      return { meanDays: supplier?.leadTimeDays ?? 0, stdDevDays: 0, observationCount: observations.length };
    }

    const days = observations.map((o) => o.observedDays);
    const meanDays = days.reduce((sum, d) => sum + d, 0) / days.length;
    const variance = days.reduce((sum, d) => sum + (d - meanDays) ** 2, 0) / days.length;

    return { meanDays, stdDevDays: Math.sqrt(variance), observationCount: days.length };
  }

  /** Computed entirely from PurchaseOrder vs GoodsReceipt vs the price each line was raised at. */
  async supplierScorecard(supplierId: string): Promise<SupplierScorecard> {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { supplierId, status: { in: ['SENT', 'PARTIAL', 'RECEIVED'] } },
      select: {
        expectedAt: true,
        items: { select: { quantityOrdered: true, quantityReceived: true, unitCost: true, receiptItems: { select: { unitCost: true, goodsReceipt: { select: { receivedAt: true } } } } } },
      },
    });

    if (orders.length === 0) return { otifPct: 0, priceVariancePct: 0, defectRatePct: null };

    let onTimeInFull = 0;
    let varianceSum = 0;
    let varianceCount = 0;

    for (const order of orders) {
      const fullyReceived = order.items.every((i) => i.quantityReceived >= i.quantityOrdered);
      const latestReceipt = order.items
        .flatMap((i) => i.receiptItems.map((r) => r.goodsReceipt.receivedAt))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const onTime = !order.expectedAt || (latestReceipt !== undefined && latestReceipt <= order.expectedAt);
      if (fullyReceived && onTime) onTimeInFull += 1;

      for (const item of order.items) {
        for (const receipt of item.receiptItems) {
          if (item.unitCost <= 0) continue;
          varianceSum += ((receipt.unitCost - item.unitCost) / item.unitCost) * 100;
          varianceCount += 1;
        }
      }
    }

    return {
      otifPct: (onTimeInFull / orders.length) * 100,
      priceVariancePct: varianceCount > 0 ? varianceSum / varianceCount : 0,
      defectRatePct: null,
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';

const LOOKBACK_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * WO-9.4 (09-ai-layer.md) — nightly recompute of CityCodRiskStat, the cached
 * input CodRiskService reads at place() instead of aggregating shipment
 * history on every checkout. Trailing 180 days, COD shipments only (a
 * prepaid order carries no RTO risk to learn from) — this node's own
 * Shipment/Order tables, which `orders` already owns outright, so this needs
 * no cross-module coupling.
 */
@Injectable()
export class CodRiskCron {
  private readonly logger = new Logger(CodRiskCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 1 * * *')
  async computeCityCodRiskStats(): Promise<void> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);

    const shipments = await this.prisma.shipment.findMany({
      where: { dispatchedAt: { gte: since } },
      select: {
        isRto: true,
        order: {
          select: {
            grandTotal: true,
            shippingAddress: true,
            payments: { select: { provider: true }, take: 1 },
          },
        },
      },
    });

    const byCity = new Map<string, { total: number; rto: number; valueSum: number }>();
    for (const shipment of shipments) {
      if (shipment.order.payments[0]?.provider !== 'cod') continue;
      const city = readCity(shipment.order.shippingAddress);
      if (!city) continue;

      const stats = byCity.get(city) ?? { total: 0, rto: 0, valueSum: 0 };
      stats.total += 1;
      if (shipment.isRto) stats.rto += 1;
      stats.valueSum += shipment.order.grandTotal;
      byCity.set(city, stats);
    }

    const now = new Date();
    for (const [city, stats] of byCity) {
      await this.prisma.cityCodRiskStat.upsert({
        where: { city },
        create: {
          city,
          totalShipments: stats.total,
          rtoShipments: stats.rto,
          avgOrderValue: Math.round(stats.valueSum / stats.total),
          computedAt: now,
        },
        update: {
          totalShipments: stats.total,
          rtoShipments: stats.rto,
          avgOrderValue: Math.round(stats.valueSum / stats.total),
          computedAt: now,
        },
      });
    }

    this.logger.log(`COD risk city stats: recomputed ${byCity.size} cit${byCity.size === 1 ? 'y' : 'ies'}`);
  }
}

function readCity(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const city = (value as Record<string, unknown>).city;
  return typeof city === 'string' && city.trim() ? city.trim() : null;
}

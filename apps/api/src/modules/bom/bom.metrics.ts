import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { RawUsageQueryDto } from './dto/raw-usage.dto';
import type { RawMaterialUnit } from '../../core/prisma/client';

export interface RawUsagePoint {
  /** Bucket start — an ISO date ("2026-08-14") or an ISO month ("2026-08"), matching `bucket`. */
  t: string;
  /** rawMaterialId -> base units consumed in this bucket. */
  byMaterial: Record<string, number>;
}

export interface RawUsageTotal {
  rawMaterialId: string;
  name: string;
  unit: RawMaterialUnit;
  unitScale: number;
  consumedBase: number;
  /** Paisa. Present only for a caller with inventory.view_cost — stripped in the controller. */
  consumedCost?: number;
  /** Distinct production runs that consumed this material in the window. */
  runs: number;
  /** This material's share of total base-unit consumption in the window, basis points. */
  shareBps: number;
}

export interface RawUsageResult {
  series: RawUsagePoint[];
  totals: RawUsageTotal[];
  bucket: 'day' | 'month';
}

/**
 * WO-C.4 (10-admin-dashboard.md §C) — raw-material consumption over time.
 * ADR-019's precedent applies again here: the doc specs this against Track
 * A's `card-registry.ts`/`report-registry.ts`, which was never built (see
 * WO-B.4). Shipped instead as a plain endpoint + screen, the live idiom
 * every other analytics page in this codebase already uses.
 *
 * Sourced from StockMovement where refType='BomProductionRun' AND delta<0
 * (@@index([refType, refId]) already exists — D7's own reason for choosing
 * refType over a new StockMovementReason value) — a path independent of
 * BomProductionLine, which is why the acceptance criterion that the two
 * sums agree is worth testing at all.
 */
@Injectable()
export class BomMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async rawUsage(query: RawUsageQueryDto): Promise<RawUsageResult> {
    const days = query.days ?? 30;
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const bucket: 'day' | 'month' = query.bucket ?? (days <= 62 ? 'day' : 'month');

    const movements = await this.prisma.stockMovement.findMany({
      where: {
        refType: 'BomProductionRun',
        delta: { lt: 0 },
        createdAt: { gte: from, lte: to },
        variant: {
          rawMaterial: {
            is: {
              ...(query.rawMaterialId ? { id: query.rawMaterialId } : {}),
              ...(query.kind ? { kind: query.kind } : {}),
            },
          },
        },
      },
      select: {
        delta: true,
        unitCost: true,
        createdAt: true,
        refId: true,
        variant: { select: { rawMaterial: { select: { id: true, name: true, unit: true, unitScale: true } } } },
      },
    });

    const points = new Map<string, RawUsagePoint>();
    const totals = new Map<
      string,
      { name: string; unit: RawMaterialUnit; unitScale: number; consumedBase: number; consumedCost: number; runIds: Set<string> }
    >();

    for (const movement of movements) {
      const material = movement.variant.rawMaterial;
      if (!material) continue; // the type guard for a nullable relation Prisma's `is` filter already enforced at the query level

      const consumedBase = -movement.delta;
      const key =
        bucket === 'day' ? movement.createdAt.toISOString().slice(0, 10) : movement.createdAt.toISOString().slice(0, 7);

      const point = points.get(key) ?? { t: key, byMaterial: {} };
      point.byMaterial[material.id] = (point.byMaterial[material.id] ?? 0) + consumedBase;
      points.set(key, point);

      const total = totals.get(material.id) ?? {
        name: material.name,
        unit: material.unit,
        unitScale: material.unitScale,
        consumedBase: 0,
        consumedCost: 0,
        runIds: new Set<string>(),
      };
      total.consumedBase += consumedBase;
      total.consumedCost += consumedBase * (movement.unitCost ?? 0);
      if (movement.refId) total.runIds.add(movement.refId);
      totals.set(material.id, total);
    }

    const grandTotalBase = [...totals.values()].reduce((sum, total) => sum + total.consumedBase, 0);

    return {
      series: [...points.values()].sort((a, b) => a.t.localeCompare(b.t)),
      totals: [...totals.entries()]
        .map(([rawMaterialId, total]) => ({
          rawMaterialId,
          name: total.name,
          unit: total.unit,
          unitScale: total.unitScale,
          consumedBase: total.consumedBase,
          consumedCost: total.consumedCost,
          runs: total.runIds.size,
          shareBps: grandTotalBase > 0 ? Math.round((total.consumedBase * 10_000) / grandTotalBase) : 0,
        }))
        .sort((a, b) => b.consumedBase - a.consumedBase),
      bucket,
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const CO_OCCURRENCE_WINDOW_DAYS = 180;
/** Below this, two products sharing one impulse-buy order is noise, not a pattern. */
const MIN_CO_OCCURRENCE_ORDERS = 2;
/** Safety valve on one run's own workload — a boutique-scale catalogue never approaches this. */
const MAX_PAIRS_PER_RUN = 20_000;
const CO_OCCURRENCE_FILL_LIMIT = 6;
const EMBEDDING_FILL_LIMIT = 6;
/** How many products with no other signal yet get an embedding fallback computed per run — bounds this cron's own cost the same way SearchEmbeddingCron bounds its. */
const EMBEDDING_BATCH_SIZE = 50;

/**
 * WO-9.6 (09-ai-layer.md) — "Frequently bought together — co-occurrence in
 * OrderItem, no AI needed at all" and "Related products — embedding
 * similarity, cheap once WO-9.5 exists." The only writer of CO_OCCURRENCE/
 * EMBEDDING rows in ProductCrossSell; MANUAL rows (the admin cross-sell
 * screen) are never touched here — "always leave the manual override in
 * place" is enforced by never selecting a pair a MANUAL row already covers.
 */
@Injectable()
export class RecommendationsCron {
  private readonly logger = new Logger(RecommendationsCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 4 * * *')
  async recompute(): Promise<void> {
    const coOccurrence = await this.recomputeCoOccurrence();
    const embedding = await this.recomputeEmbeddingFallback();
    this.logger.log(
      `Recommendations: ${coOccurrence} co-occurrence pair(s), ${embedding} embedding-fallback pair(s)`,
    );
  }

  private async recomputeCoOccurrence(): Promise<number> {
    const since = new Date(Date.now() - CO_OCCURRENCE_WINDOW_DAYS * DAY_MS);

    const pairs = await this.prisma.$queryRaw<{ productId: string; relatedProductId: string; coCount: bigint }[]>`
      SELECT a."productId" AS "productId", b."productId" AS "relatedProductId", COUNT(DISTINCT a."orderId") AS "coCount"
      FROM "OrderItem" a
      JOIN "OrderItem" b ON a."orderId" = b."orderId" AND a."productId" <> b."productId"
      JOIN "Order" o ON o."id" = a."orderId"
      WHERE a."productId" IS NOT NULL AND b."productId" IS NOT NULL
        AND o."status" <> 'CANCELLED'
        AND o."placedAt" >= ${since}
      GROUP BY a."productId", b."productId"
      HAVING COUNT(DISTINCT a."orderId") >= ${MIN_CO_OCCURRENCE_ORDERS}
      LIMIT ${MAX_PAIRS_PER_RUN};
    `;

    // Every CO_OCCURRENCE row is algorithm-owned and gets rebuilt from
    // scratch this run — a pair that no longer qualifies (its supporting
    // orders were cancelled, or simply aged out of the window) must not
    // survive just because it happens not to be one of THIS run's products.
    // MANUAL rows are a different kind and are never touched here.
    await this.prisma.productCrossSell.deleteMany({ where: { kind: 'CO_OCCURRENCE' } });
    if (pairs.length === 0) return 0;

    const byProduct = new Map<string, Array<{ relatedProductId: string; count: number }>>();
    for (const pair of pairs) {
      const list = byProduct.get(pair.productId) ?? [];
      list.push({ relatedProductId: pair.relatedProductId, count: Number(pair.coCount) });
      byProduct.set(pair.productId, list);
    }

    // Fetched once, not per pair (N+1) — every MANUAL row this run could
    // possibly touch, so "does a manual override already cover this pair"
    // is an in-memory check below.
    const manualPairs = await this.prisma.productCrossSell.findMany({
      where: { productId: { in: [...byProduct.keys()] }, kind: 'MANUAL' },
      select: { productId: true, relatedProductId: true },
    });
    const manualKeys = new Set(manualPairs.map((m) => `${m.productId}:${m.relatedProductId}`));

    let written = 0;
    for (const [productId, related] of byProduct) {
      const top = related
        .sort((a, b) => b.count - a.count)
        .slice(0, CO_OCCURRENCE_FILL_LIMIT)
        .filter((item) => !manualKeys.has(`${productId}:${item.relatedProductId}`));

      for (const [index, item] of top.entries()) {
        // upsert, not create: the pair may already hold a stale EMBEDDING
        // row (a weaker signal a real purchase pattern now supersedes) from
        // an earlier run, before this pair ever had order history.
        await this.prisma.productCrossSell.upsert({
          where: { productId_relatedProductId: { productId, relatedProductId: item.relatedProductId } },
          create: { productId, relatedProductId: item.relatedProductId, kind: 'CO_OCCURRENCE', order: index },
          update: { kind: 'CO_OCCURRENCE', order: index },
        });
        written += 1;
      }
    }
    return written;
  }

  /**
   * Only for a product with NEITHER a manual nor a co-occurrence signal yet
   * — embedding similarity is the last-resort fill the doc itself frames it
   * as ("Related products... cheap once WO-9.5 exists"), never a competitor
   * to a real purchase pattern.
   */
  private async recomputeEmbeddingFallback(): Promise<number> {
    const candidates = await this.prisma.$queryRaw<{ productId: string }[]>`
      SELECT p."id" AS "productId"
      FROM "Product" p
      JOIN "ProductTranslation" pt ON pt."productId" = p."id" AND pt."locale" = 'en'
      WHERE p."status" = 'ACTIVE' AND pt."embedding" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "ProductCrossSell" pcs WHERE pcs."productId" = p."id" AND pcs."kind" IN ('MANUAL', 'CO_OCCURRENCE')
        )
      LIMIT ${EMBEDDING_BATCH_SIZE};
    `;
    if (candidates.length === 0) return 0;

    let written = 0;
    for (const { productId } of candidates) {
      // Never pulls the vector itself into JS (Prisma cannot deserialize
      // `Unsupported("vector")`) — the comparison happens entirely in SQL,
      // same as SearchService's own vectorMatch().
      const nearest = await this.prisma.$queryRaw<{ relatedProductId: string }[]>`
        SELECT pt2."productId" AS "relatedProductId"
        FROM "ProductTranslation" pt1
        JOIN "ProductTranslation" pt2 ON pt2."locale" = 'en' AND pt2."productId" <> pt1."productId" AND pt2."embedding" IS NOT NULL
        JOIN "Product" p2 ON p2."id" = pt2."productId" AND p2."status" = 'ACTIVE'
        WHERE pt1."productId" = ${productId} AND pt1."locale" = 'en'
        ORDER BY pt1."embedding" <=> pt2."embedding" ASC
        LIMIT ${EMBEDDING_FILL_LIMIT};
      `;

      await this.prisma.productCrossSell.deleteMany({ where: { productId, kind: 'EMBEDDING' } });
      for (const [index, row] of nearest.entries()) {
        await this.prisma.productCrossSell.upsert({
          where: { productId_relatedProductId: { productId, relatedProductId: row.relatedProductId } },
          create: { productId, relatedProductId: row.relatedProductId, kind: 'EMBEDDING', order: index },
          update: { kind: 'EMBEDDING', order: index },
        });
        written += 1;
      }
    }
    return written;
  }
}

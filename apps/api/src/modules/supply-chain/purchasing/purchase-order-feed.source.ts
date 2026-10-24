import { Injectable, type OnModuleInit } from '@nestjs/common';
import { formatMoney } from '@newax/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { FeedRegistryService } from '../../../core/feed/feed-registry.service';
import type { FeedEntry, FeedSource } from '../../../core/feed/feed-source';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';

/**
 * The live feed's purchasing source
 * (analytics-reporting/58-live-operational-feed.md). Purchasing spend is
 * `purchasing.manage`'s to see — the same hard permission gate
 * `analytics.controller.ts`'s own `purchasingSpend()`/`purchasingSuppliers()`
 * already apply to the identical figures, restated here per-source since
 * this source's caller may hold only `analytics.view` (the feed's own
 * class-level gate). `PurchaseOrder` itself carries no `locationId` column —
 * only `GoodsReceipt` does, once goods actually land somewhere — so a
 * location-scoped feed call never surfaces one (`null`, never a guessed
 * default), and simply omits this source entirely rather than leak a
 * central-purchasing document into a single branch's own view.
 */
@Injectable()
export class PurchaseOrderFeedSource implements FeedSource, OnModuleInit {
  readonly id = 'purchasing.feed';
  readonly kind = 'PURCHASE_ORDER' as const;
  readonly entryPrefix = 'po';

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: FeedRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async resolveCursor(entryId: string): Promise<Date | null> {
    const id = entryId.slice(this.entryPrefix.length + 1);
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id }, select: { createdAt: true } });
    return po?.createdAt ?? null;
  }

  async fetchRecent(user: AuthenticatedUser, since: Date | null, locationId: string | undefined, limit: number): Promise<FeedEntry[]> {
    if (!user.permissions.includes('purchasing.manage') || locationId) return [];

    const orders = await this.prisma.purchaseOrder.findMany({
      where: since ? { createdAt: { gt: since } } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, number: true, total: true, createdAt: true },
    });

    return orders.map((po) => ({
      id: `${this.entryPrefix}:${po.id}`,
      kind: this.kind,
      summary: `Purchase order #${po.number} raised, ${formatMoney(po.total)}`,
      occurredAt: po.createdAt,
      href: `/admin/purchase-orders/${po.id}`,
      locationId: null,
    }));
  }
}

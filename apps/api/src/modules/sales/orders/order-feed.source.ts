import { Injectable, type OnModuleInit } from '@nestjs/common';
import { formatMoney } from '@newax/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { FeedRegistryService } from '../../../core/feed/feed-registry.service';
import type { FeedEntry, FeedSource } from '../../../core/feed/feed-source';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';

/**
 * The live feed's own worked example
 * (analytics-reporting/58-live-operational-feed.md) — an order placement,
 * newest first. "Order statuses" from the doc's own framing is already
 * covered elsewhere (doc 69's lifecycle breakdown, `ordersOverview()`); this
 * source names the one discrete event `placedAt` actually records.
 */
@Injectable()
export class OrderFeedSource implements FeedSource, OnModuleInit {
  readonly id = 'orders.feed';
  readonly kind = 'ORDER' as const;
  readonly entryPrefix = 'order';

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: FeedRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async resolveCursor(entryId: string): Promise<Date | null> {
    const id = entryId.slice(this.entryPrefix.length + 1);
    const order = await this.prisma.order.findUnique({ where: { id }, select: { placedAt: true } });
    return order?.placedAt ?? null;
  }

  async fetchRecent(_user: AuthenticatedUser, since: Date | null, locationId: string | undefined, limit: number): Promise<FeedEntry[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        ...(since ? { placedAt: { gt: since } } : {}),
        ...(locationId ? { locationId } : {}),
      },
      orderBy: { placedAt: 'desc' },
      take: limit,
      select: { id: true, number: true, grandTotal: true, placedAt: true, locationId: true },
    });

    return orders.map((order) => ({
      id: `${this.entryPrefix}:${order.id}`,
      kind: this.kind,
      summary: `Order #${order.number} placed, ${formatMoney(order.grandTotal)}`,
      occurredAt: order.placedAt,
      href: `/admin/orders/${order.id}`,
      locationId: order.locationId,
    }));
  }
}

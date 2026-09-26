import { Injectable, type OnModuleInit } from '@nestjs/common';
import { formatMoney } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { FeedRegistryService } from '../../core/feed/feed-registry.service';
import type { FeedEntry, FeedSource } from '../../core/feed/feed-source';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';

/**
 * The live feed's payment source
 * (analytics-reporting/58-live-operational-feed.md). Only `PAID` payments —
 * the feed is a glance at real revenue events, not every pending or failed
 * attempt. `Payment` itself carries no `locationId` column, so it is
 * resolved from its own order — the movement's real address, not a default.
 */
@Injectable()
export class PaymentFeedSource implements FeedSource, OnModuleInit {
  readonly id = 'payments.feed';
  readonly kind = 'PAYMENT' as const;
  readonly entryPrefix = 'payment';

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: FeedRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async resolveCursor(entryId: string): Promise<Date | null> {
    const id = entryId.slice(this.entryPrefix.length + 1);
    const payment = await this.prisma.payment.findUnique({ where: { id }, select: { createdAt: true } });
    return payment?.createdAt ?? null;
  }

  async fetchRecent(_user: AuthenticatedUser, since: Date | null, locationId: string | undefined, limit: number): Promise<FeedEntry[]> {
    const payments = await this.prisma.payment.findMany({
      where: {
        status: 'PAID',
        ...(since ? { createdAt: { gt: since } } : {}),
        ...(locationId ? { order: { locationId } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, amount: true, createdAt: true, order: { select: { id: true, number: true, locationId: true } } },
    });

    return payments.map((payment) => ({
      id: `${this.entryPrefix}:${payment.id}`,
      kind: this.kind,
      summary: `Payment received for order #${payment.order.number}, ${formatMoney(payment.amount)}`,
      occurredAt: payment.createdAt,
      href: `/admin/orders/${payment.order.id}`,
      locationId: payment.order.locationId,
    }));
  }
}

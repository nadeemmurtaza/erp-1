import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey, type FinanceGatewayFeeBpsSettings } from '../../core/settings/settings.defaults';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';
import type { OrderEconomics } from '../../core/prisma/client';
import { startOfShopDay } from '../../core/time/shop-time';
import { VOID_ORDER_STATUSES } from '../../core/common/sales-revenue';

export interface GrossProfitTransaction {
  orderId: string;
  orderNumber: string;
  revenue: number;
  cogs: number;
  contribution: number;
  marginBps: number;
}

export interface GrossProfitToday {
  transactions: GrossProfitTransaction[];
  dayTotal: { revenue: number; cogs: number; contribution: number; marginBps: number };
}

interface Computed {
  revenue: number;
  shippingIncome: number;
  codFeeIncome: number;
  cogs: number;
  shippingCost: number;
  shippingCostEstimated: boolean;
  gatewayFee: number;
  packagingCost: number;
  contribution: number;
}

const COMPUTED_FIELDS: (keyof Computed)[] = [
  'revenue',
  'shippingIncome',
  'codFeeIncome',
  'cogs',
  'shippingCost',
  'shippingCostEstimated',
  'gatewayFee',
  'packagingCost',
  'contribution',
];

/**
 * WO-23.1's WO-B.3: contribution per order. A derived reporting snapshot —
 * see finance.prisma's own header on OrderEconomics for why this is not a GL
 * posting. Written by FinanceListener on DELIVERED, recomputed on RETURNED;
 * never touched on any other status.
 */
@Injectable()
export class OrderEconomicsService {
  private readonly logger = new Logger(OrderEconomicsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly events: EventBusService,
  ) {}

  /**
   * `returned: true` zeroes revenue and cogs — the single most common way
   * this kind of table lies is reversing revenue alone, which drives margin
   * negative on every return. Every other component (shipping, gateway fee,
   * packaging) already happened and stays as computed: a return does not
   * un-spend the courier or the payment gateway.
   *
   * Idempotent by comparison, not by guard: this recomputes from the order's
   * current state and only writes when a component actually differs from
   * what is already stored, so a replayed event (at-least-once delivery)
   * writes no second row, touches no timestamp and fires no second
   * OrderEconomicsComputed.
   */
  async computeForOrder(orderId: string, returned: boolean): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        itemsSubtotal: true,
        stitchingSubtotal: true,
        itemDiscountTotal: true,
        orderDiscount: true,
        shippingFee: true,
        codFee: true,
        grandTotal: true,
        items: { select: { unitCost: true, quantity: true } },
        shipments: { select: { cost: true } },
        payments: { select: { provider: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!order) {
      this.logger.warn(`OrderEconomics requested for order ${orderId}, but it no longer exists — skipped.`);
      return;
    }

    const revenue = returned
      ? 0
      : order.itemsSubtotal + order.stitchingSubtotal - order.itemDiscountTotal - order.orderDiscount;
    const cogs = returned ? 0 : order.items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);

    const shippingIncome = order.shippingFee;
    const codFeeIncome = order.codFee;

    const shipmentCosts = order.shipments.map((shipment) => shipment.cost);
    const shippingCost = shipmentCosts.reduce<number>((sum, cost) => sum + (cost ?? 0), 0);
    const shippingCostEstimated = shipmentCosts.length === 0 || shipmentCosts.some((cost) => cost === null);

    const feeBps = await this.settings.get<FinanceGatewayFeeBpsSettings>(SettingKey.FinanceGatewayFeeBps);
    const providerKey = order.payments[0]?.provider;
    const bps = (providerKey !== undefined ? feeBps[providerKey] : undefined) ?? feeBps.default;
    const gatewayFee = Math.round((order.grandTotal * bps) / 10_000);

    const packagingCost = await this.settings.get<number>(SettingKey.FinancePackagingCostPerOrder);

    const contribution =
      revenue + shippingIncome + codFeeIncome - cogs - shippingCost - gatewayFee - packagingCost;

    const computed: Computed = {
      revenue,
      shippingIncome,
      codFeeIncome,
      cogs,
      shippingCost,
      shippingCostEstimated,
      gatewayFee,
      packagingCost,
      contribution,
    };

    const existing = await this.prisma.orderEconomics.findUnique({ where: { orderId } });
    if (existing && unchanged(existing, computed)) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.orderEconomics.upsert({
        where: { orderId },
        create: { orderId, ...computed },
        update: computed,
      });

      await this.events.publish(DomainEvent.OrderEconomicsComputed, { orderId, revenue, cogs, contribution }, tx);
    });

    this.logger.log(`OrderEconomics computed for order ${orderId}: contribution=${contribution}`);
  }

  /**
   * WO-68.2 (68-realtime-gross-profit.md). A read over today's
   * `OrderEconomics` rows, joined to `Order` for the shop-day boundary and
   * the same void-status filter `AnalyticsService.summary()` already uses
   * — never a second definition of "counts as a sale" or "today."
   * `marginBps` is basis points (House Rule 5), 0 when revenue is 0 rather
   * than a division-by-zero NaN.
   */
  async grossProfitToday(locationId?: string): Promise<GrossProfitToday> {
    const timeZone = await this.settings.get<string>(SettingKey.StoreTimezone);
    const startOfToday = startOfShopDay(new Date(), timeZone);

    const orders = await this.prisma.order.findMany({
      where: {
        placedAt: { gte: startOfToday },
        status: { notIn: VOID_ORDER_STATUSES },
        ...(locationId ? { locationId } : {}),
        economics: { isNot: null },
      },
      select: {
        id: true,
        number: true,
        placedAt: true,
        economics: { select: { revenue: true, cogs: true, contribution: true } },
      },
      orderBy: { placedAt: 'desc' },
    });

    const transactions: GrossProfitTransaction[] = orders.map((order) => ({
      orderId: order.id,
      orderNumber: order.number,
      revenue: order.economics!.revenue,
      cogs: order.economics!.cogs,
      contribution: order.economics!.contribution,
      marginBps: marginBps(order.economics!.revenue, order.economics!.contribution),
    }));

    const dayTotal = transactions.reduce(
      (sum, t) => ({ revenue: sum.revenue + t.revenue, cogs: sum.cogs + t.cogs, contribution: sum.contribution + t.contribution }),
      { revenue: 0, cogs: 0, contribution: 0 },
    );

    return {
      transactions,
      dayTotal: { ...dayTotal, marginBps: marginBps(dayTotal.revenue, dayTotal.contribution) },
    };
  }
}

function marginBps(revenue: number, contribution: number): number {
  return revenue > 0 ? Math.round((contribution / revenue) * 10_000) : 0;
}

function unchanged(existing: OrderEconomics, computed: Computed): boolean {
  return COMPUTED_FIELDS.every((field) => existing[field] === computed[field]);
}

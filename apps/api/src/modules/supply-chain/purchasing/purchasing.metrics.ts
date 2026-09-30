import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { PermissionKey } from '@newax/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricRegistryService } from '../../../core/metrics/metric-registry.service';
import type { MetricContext, MetricProvider, MetricValue } from '../../../core/metrics/metric-provider';

/**
 * The Purchasing group's dashboard cards (10-admin-dashboard.md card
 * inventory, WO-A.4). `purchasing.spend` is split into its own provider,
 * gated by `inventory.view_cost` rather than the group's own
 * `purchasing.manage` — it is the one card in this group that surfaces a
 * landed COST figure rather than a supplier-invoiced amount, the same
 * distinction `sales.gross_profit` and `inventory.valuation` draw elsewhere
 * in this card inventory.
 */
@Injectable()
export class PurchasingMetricsProvider implements MetricProvider, OnModuleInit {
  readonly id = 'purchasing.metrics';
  readonly keys = [
    'purchasing.open_pos',
    'purchasing.awaiting_transit',
    'purchasing.partial',
    'purchasing.unpaid_bills_amount',
    'purchasing.overdue_bills',
    'purchasing.top_supplier_share_bps',
  ];
  readonly permissions: readonly PermissionKey[] = ['purchasing.manage'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly metricRegistry: MetricRegistryService,
  ) {}

  onModuleInit(): void {
    this.metricRegistry.register(this);
  }

  async collect(ctx: MetricContext, wanted: readonly string[]): Promise<Record<string, MetricValue>> {
    const want = (key: string) => wanted.includes(key);
    const now = new Date();
    const out: Record<string, MetricValue> = {};

    const [statusCounts, unpaidBills, overdueBills, bySupplier, bySupplierPrev] = await Promise.all([
      this.prisma.purchaseOrder.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.supplierBill.aggregate({
        where: { status: { not: 'PAID' } },
        _sum: { amount: true, amountPaid: true },
      }),
      this.prisma.supplierBill.count({ where: { status: { not: 'PAID' }, dueAt: { lt: now } } }),
      // "ordered" spend by supplier — the same definition
      // analytics.service.ts's PurchasingSpend.totals.ordered uses (Σ
      // PurchaseOrder.total by sentAt) — grouped by supplier for the share.
      this.prisma.purchaseOrder.groupBy({
        by: ['supplierId'],
        where: { sentAt: { gte: ctx.from, lt: ctx.to } },
        _sum: { total: true },
      }),
      this.prisma.purchaseOrder.groupBy({
        by: ['supplierId'],
        where: { sentAt: { gte: ctx.prevFrom, lt: ctx.prevTo } },
        _sum: { total: true },
      }),
    ]);

    const countFor = (status: string) => statusCounts.find((row) => row.status === status)?._count._all ?? 0;
    const shareBps = (rows: typeof bySupplier) => {
      const totals = rows.map((row) => row._sum.total ?? 0);
      const grand = totals.reduce((sum, value) => sum + value, 0);
      const top = totals.length > 0 ? Math.max(...totals) : 0;
      return grand > 0 ? Math.round((top / grand) * 10000) : 0;
    };

    if (want('purchasing.open_pos')) {
      out['purchasing.open_pos'] = { value: countFor('DRAFT'), previous: null, unit: 'count' };
    }
    if (want('purchasing.awaiting_transit')) {
      out['purchasing.awaiting_transit'] = { value: countFor('SENT'), previous: null, unit: 'count' };
    }
    if (want('purchasing.partial')) {
      out['purchasing.partial'] = { value: countFor('PARTIAL'), previous: null, unit: 'count' };
    }
    if (want('purchasing.unpaid_bills_amount')) {
      const outstanding = (unpaidBills._sum.amount ?? 0) - (unpaidBills._sum.amountPaid ?? 0);
      out['purchasing.unpaid_bills_amount'] = { value: outstanding, previous: null, unit: 'paisa' };
    }
    if (want('purchasing.overdue_bills')) {
      out['purchasing.overdue_bills'] = { value: overdueBills, previous: null, unit: 'count' };
    }
    if (want('purchasing.top_supplier_share_bps')) {
      out['purchasing.top_supplier_share_bps'] = {
        value: shareBps(bySupplier),
        previous: shareBps(bySupplierPrev),
        unit: 'bps',
      };
    }
    return out;
  }
}

/** `purchasing.spend` alone — see the class doc above for why it is split out. */
@Injectable()
export class PurchasingSpendMetricsProvider implements MetricProvider, OnModuleInit {
  readonly id = 'purchasing.spend.metrics';
  readonly keys = ['purchasing.spend'];
  readonly permissions: readonly PermissionKey[] = ['inventory.view_cost'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly metricRegistry: MetricRegistryService,
  ) {}

  onModuleInit(): void {
    this.metricRegistry.register(this);
  }

  async collect(ctx: MetricContext): Promise<Record<string, MetricValue>> {
    // "received" spend — Σ GoodsReceiptItem.quantity × landedUnitCost by
    // GoodsReceipt.receivedAt. Same definition as
    // analytics.service.ts's PurchasingSpend.totals.received and
    // comparison()'s own "purchases" figure — the shared ground floor those
    // two agree on, restated here rather than imported (no feature-module
    // import across purchasing/analytics).
    const spendFor = async (from: Date, to: Date) => {
      const rows = await this.prisma.goodsReceiptItem.findMany({
        where: { goodsReceipt: { receivedAt: { gte: from, lt: to } } },
        select: { quantity: true, landedUnitCost: true },
      });
      return rows.reduce((sum, row) => sum + row.quantity * row.landedUnitCost, 0);
    };

    const [value, previous] = await Promise.all([spendFor(ctx.from, ctx.to), spendFor(ctx.prevFrom, ctx.prevTo)]);
    return { 'purchasing.spend': { value, previous, unit: 'paisa' } };
  }
}

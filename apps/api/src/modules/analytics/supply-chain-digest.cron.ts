import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey, StoreSettings } from '../../core/settings/settings.defaults';
import { DomainEvent, type SupplierDigestReadyPayload } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Three scheduled reports, none of them new machinery — each reads tables
 * Increments 1-5 already populate (StockMovement, PurchaseOrder,
 * GoodsReceipt, WorkOrder) and sends through the existing
 * NotificationsService, the same as InventoryListener's low-stock alert.
 *
 * No EDI, no external integration platform, no BI tool: a boutique shop
 * with a handful of known suppliers needs a nightly email and two internal
 * threshold checks, not a vendor-managed-inventory platform built for
 * forcing a standard onto unwilling trading partners.
 */
@Injectable()
export class SupplyChainDigestCron {
  private readonly logger = new Logger(SupplyChainDigestCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly events: EventBusService,
  ) {}

  // --- 1. Supplier stock & sales velocity digest (nightly, external) -------

  @Cron('0 1 * * *')
  async sendSupplierDigests(): Promise<void> {
    const leadDays = await this.settings.get<number>(SettingKey.PurchasingSupplierDigestLeadDays);
    const now = new Date();

    const suppliers = await this.prisma.supplier.findMany({
      where: { isActive: true, preferredVariants: { some: {} } },
      include: {
        party: { select: { email: true } },
        preferredVariants: { where: { isActive: true }, select: { id: true, sku: true, stock: true, reorderPoint: true } },
      },
    });

    let sent = 0;
    for (const supplier of suppliers) {
      const email = supplier.party?.email ?? supplier.email;

      const lines: string[] = [];
      const items: SupplierDigestReadyPayload['items'] = [];
      for (const variant of supplier.preferredVariants) {
        const velocity = await this.salesVelocity(variant.id, now);
        const projectedDaysToReorderPoint =
          variant.reorderPoint !== null && velocity.perDay > 0
            ? (variant.stock - variant.reorderPoint) / velocity.perDay
            : null;

        const actionNeeded =
          variant.reorderPoint !== null &&
          (variant.stock <= variant.reorderPoint ||
            (projectedDaysToReorderPoint !== null && projectedDaysToReorderPoint <= leadDays));

        if (!actionNeeded) continue;

        items.push({ sku: variant.sku, stock: variant.stock, soldToday: velocity.today, soldThisWeek: velocity.week, actionNeeded });

        const days = projectedDaysToReorderPoint !== null ? Math.max(0, Math.round(projectedDaysToReorderPoint)) : 0;
        lines.push(
          `${variant.sku} — Stock: ${variant.stock}. Sold today: ${velocity.today}. Sold this week: ${velocity.week}. ` +
            `Action required: Replenish within ${days} day${days === 1 ? '' : 's'}.`,
        );
      }

      if (items.length === 0) continue;

      // A connected TradingPartner gets this structured, whether or not the
      // supplier also has an email on file — the two channels are independent.
      await this.events.publish(DomainEvent.SupplierDigestReady, { supplierId: supplier.id, items });

      if (!email) continue;

      await this.notifications.send({
        template: 'purchasing.supplier_digest',
        recipient: { email, name: supplier.name },
        subject: `Stock update — ${lines.length} item(s) need replenishing soon`,
        body: lines.join('\n'),
        data: { supplierId: supplier.id },
      });
      sent += 1;
    }

    this.logger.log(`Supplier digest: sent to ${sent} of ${suppliers.length} supplier(s)`);
  }

  private async salesVelocity(variantId: string, now: Date) {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

    const sales = await this.prisma.stockMovement.findMany({
      where: { variantId, reason: 'SALE', createdAt: { gte: thirtyDaysAgo } },
      select: { delta: true, createdAt: true },
    });

    let today = 0;
    let week = 0;
    let month = 0;
    for (const sale of sales) {
      const qty = -sale.delta;
      month += qty;
      if (sale.createdAt >= sevenDaysAgo) week += qty;
      if (sale.createdAt >= startOfDay) today += qty;
    }

    return { today, week, month, perDay: month / 30 };
  }

  // --- 2. Supplier OTIF scorecard (weekly, internal) ------------------------

  @Cron('0 7 * * 1')
  async sendSupplierScorecards(): Promise<void> {
    const threshold = await this.settings.get<number>(SettingKey.PurchasingSupplierScorecardOtifThreshold);
    const store = await this.settings.get<StoreSettings>(SettingKey.Store);
    const since = new Date(Date.now() - 30 * DAY_MS);

    const suppliers = await this.prisma.supplier.findMany({
      where: {
        isActive: true,
        purchaseOrders: { some: { expectedAt: { gte: since, not: null }, status: { in: ['RECEIVED', 'PARTIAL', 'SENT'] } } },
      },
      include: {
        purchaseOrders: {
          where: { expectedAt: { gte: since, not: null }, status: { in: ['RECEIVED', 'PARTIAL', 'SENT'] } },
          include: { items: true, receipts: true },
        },
      },
    });

    let alerted = 0;
    for (const supplier of suppliers) {
      // A PO still SENT (not yet received) only counts once it's overdue —
      // otherwise every in-flight order would count against the supplier
      // before its promised date has even passed.
      const now = new Date();
      const scored = supplier.purchaseOrders.filter(
        (po) => po.status !== 'SENT' || (po.expectedAt && po.expectedAt < now),
      );
      if (scored.length === 0) continue;

      let onTimeInFull = 0;
      let worstExample: string | null = null;
      for (const po of scored) {
        const inFull = po.items.every((item) => item.quantityReceived >= item.quantityOrdered);
        const lastReceiptAt = po.receipts.reduce<Date | null>(
          (latest, r) => (!latest || r.receivedAt > latest ? r.receivedAt : latest),
          null,
        );
        const onTime = po.expectedAt !== null && lastReceiptAt !== null && lastReceiptAt <= po.expectedAt;
        if (inFull && onTime) {
          onTimeInFull += 1;
        } else if (!worstExample) {
          worstExample = po.number;
        }
      }

      const otifPercent = Math.round((onTimeInFull / scored.length) * 100);
      if (otifPercent >= threshold) continue;

      await this.notifications.send({
        template: 'purchasing.supplier_scorecard',
        recipient: { email: store.supportEmail, name: store.nameEn },
        subject: `Supplier performance warning: ${supplier.name}`,
        body:
          `Supplier ${supplier.name} OTIF dropped to ${otifPercent}% over the last 30 days` +
          (worstExample ? ` — most recently late/short on ${worstExample}.` : '.'),
        data: { supplierId: supplier.id, otifPercent },
      });
      alerted += 1;
    }

    this.logger.log(`Supplier scorecard: alerted on ${alerted} of ${suppliers.length} scored supplier(s)`);
  }

  // --- 3. Demand vs. replenishment-in-flight alert (weekly, internal) -------

  @Cron('0 8 * * 1')
  async sendDemandAlerts(): Promise<void> {
    const horizonDays = await this.settings.get<number>(SettingKey.InventoryDemandSurgeHorizonDays);
    const store = await this.settings.get<StoreSettings>(SettingKey.Store);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * DAY_MS);

    const variants = await this.prisma.productVariant.findMany({
      where: { isActive: true },
      select: { id: true, sku: true, stock: true },
    });

    let alerted = 0;
    for (const variant of variants) {
      const sales = await this.prisma.stockMovement.findMany({
        where: { variantId: variant.id, reason: 'SALE', createdAt: { gte: fourteenDaysAgo } },
        select: { delta: true, createdAt: true },
      });
      if (sales.length === 0) continue;

      let thisWeek = 0;
      let priorWeek = 0;
      for (const sale of sales) {
        const qty = -sale.delta;
        if (sale.createdAt >= sevenDaysAgo) thisWeek += qty;
        else priorWeek += qty;
      }
      if (thisWeek === 0 || priorWeek === 0) continue;

      const changePercent = ((thisWeek - priorWeek) / priorWeek) * 100;
      if (changePercent <= 0) continue; // only a surge is worth flagging here

      const velocityPerDay = thisWeek / 7;
      const [openPurchaseItems, openWorkOrders] = await Promise.all([
        this.prisma.purchaseOrderItem.findMany({
          where: { variantId: variant.id, purchaseOrder: { status: { in: ['DRAFT', 'SENT', 'PARTIAL'] } } },
          select: { quantityOrdered: true, quantityReceived: true },
        }),
        this.prisma.workOrder.findMany({
          where: { variantId: variant.id, status: { in: ['DRAFT', 'RELEASED'] } },
          select: { quantityOrdered: true, quantityCompleted: true },
        }),
      ]);
      const inFlight =
        openPurchaseItems.reduce((sum, i) => sum + (i.quantityOrdered - i.quantityReceived), 0) +
        openWorkOrders.reduce((sum, w) => sum + (w.quantityOrdered - w.quantityCompleted), 0);

      const projectedDaysOfCover = (variant.stock + inFlight) / velocityPerDay;
      if (projectedDaysOfCover > horizonDays) continue;

      await this.notifications.send({
        template: 'inventory.demand_surge',
        recipient: { email: store.supportEmail, name: store.nameEn },
        subject: `Market surge alert: ${variant.sku}`,
        body:
          `${variant.sku} sales up ${Math.round(changePercent)}% this week. ` +
          `Current stock plus everything already on order/in production will last about ` +
          `${Math.max(0, Math.round(projectedDaysOfCover))} day(s) at this rate.`,
        data: { variantId: variant.id, changePercent, projectedDaysOfCover },
      });
      alerted += 1;
    }

    this.logger.log(`Demand alert: flagged ${alerted} of ${variants.length} variant(s)`);
  }
}

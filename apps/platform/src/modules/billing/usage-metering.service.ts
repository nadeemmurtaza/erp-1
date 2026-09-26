import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'pg';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantCredentialResolverService } from '../../core/tenant-credentials/tenant-credential-resolver.service';
import { SeatCounterService } from './seat-counter.service';
import { currentCalendarMonthPeriod } from './billing-period';
import type { Prisma } from '../../core/prisma/client';

type PrismaTx = Prisma.TransactionClient;

/**
 * doc 153 §2 (commercial-licensing-agency/153-usage-based-pricing-model.md,
 * WO-153.2) — metering for USAGE_BASED tenants, read out of each tenant's
 * own transactional outbox rather than a push from apps/api. See ADR-037
 * for why: no new actor/credential is introduced (doc 153's own Scope
 * lenses require this), so this app reads FROM a tenant's own database
 * through the identical connection-per-call mechanism
 * `SeatCounterService.countBillableSeats()` already established — never a
 * new push channel calling into this control plane.
 *
 * Two write modes share the `UsageMeter` table:
 *  - INCREMENT (`transaction_fee_minor`, `messages_sent`) — genuinely
 *    consumed actions, accumulated across the period from outbox events.
 *  - SNAPSHOT (`products_count`, `seats_count`) — count-at-rest dimensions;
 *    `quantity` is SET to the latest observed value, never accumulated,
 *    since what an allowance check cares about is "how many right now",
 *    not "how many events changed this count" (doc 153 §1's own "never a
 *    strict per-unit multiplier" for these dimensions).
 */
const ORDER_STATUS_CHANGED_EVENT = 'order.status_changed'; // apps/api DomainEvent.OrderStatusChanged — string contract, see class doc.
const NOTIFICATION_SENT_EVENT = 'notification.sent'; // apps/api DomainEvent.NotificationSent — string contract, see class doc.
const POLL_BATCH_SIZE = 500;
const MAX_BATCHES_PER_TENANT_PER_RUN = 20; // hard cap so one very-behind tenant can't stall the cron run indefinitely.
const CONNECT_STATEMENT_TIMEOUT_MS = 10_000;

interface OutboxRow {
  id: string;
  name: string;
  payload: unknown;
  createdAt: Date;
}

interface OrderStatusChangedPayload {
  orderId: string;
  toStatus: string;
}

export interface PollResult {
  scanned: number;
  metered: number;
  reversed: number;
}

@Injectable()
export class UsageMeteringService {
  private readonly logger = new Logger(UsageMeteringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: TenantCredentialResolverService,
    private readonly seatCounter: SeatCounterService,
  ) {}

  /** All UsageMeter rows for one tenant/period, as a metric -> quantity
   *  map — the one place `BillingService.computeCharge()`'s USAGE_BASED
   *  branch and this service's own snapshot logic both read from, so a
   *  preview and the eventual invoice can never disagree (doc 153's own
   *  "dry run before live"). */
  async getMetersForPeriod(tenantId: string, periodStart: Date): Promise<Map<string, number>> {
    const rows = await this.prisma.usageMeter.findMany({ where: { tenantId, periodStart } });
    return new Map(rows.map((row) => [row.metric, row.quantity]));
  }

  /**
   * Reads new rows from ONE tenant's own `OutboxEvent` table (read-only,
   * connection opened and closed for this call, nothing cached — the same
   * discipline `SeatCounterService` already documents) and applies every
   * transaction-fee / messages-sent fact they carry to this control
   * plane's OWN `UsageMeter`/`MeteredOrderFee` rows. Never mutates the
   * tenant's own database.
   */
  async pollTenant(tenantId: string): Promise<PollResult> {
    const tenant = await this.prisma.platformTenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
    if (!tenant || tenant.plan.pricingModel !== 'USAGE_BASED') return { scanned: 0, metered: 0, reversed: 0 };

    const transactionFeeBps = tenant.plan.transactionFeeBps ?? 0;
    const total: PollResult = { scanned: 0, metered: 0, reversed: 0 };
    for (let batch = 0; batch < MAX_BATCHES_PER_TENANT_PER_RUN; batch++) {
      const result = await this.pollOneBatch(tenantId, transactionFeeBps);
      total.scanned += result.scanned;
      total.metered += result.metered;
      total.reversed += result.reversed;
      if (result.scanned < POLL_BATCH_SIZE) break; // caught up
    }
    return total;
  }

  private async pollOneBatch(tenantId: string, transactionFeeBps: number): Promise<PollResult> {
    const cursor = await this.prisma.usageMeteringCursor.findUnique({ where: { tenantId } });
    const sinceCreatedAt = cursor?.lastEventCreatedAt ?? new Date(0);
    const sinceId = cursor?.lastEventId ?? '';

    const connectionString = await this.credentials.resolveConnectionString(tenantId);
    const client = new Client({ connectionString, statement_timeout: CONNECT_STATEMENT_TIMEOUT_MS });
    await client.connect();

    let rows: OutboxRow[];
    let orderAmounts: Map<string, number>;
    try {
      const outboxResult = await client.query<OutboxRow>(
        `SELECT "id", "name", "payload", "createdAt" FROM "OutboxEvent"
          WHERE "name" IN ($1, $2)
            AND ("createdAt", "id") > ($3, $4)
          ORDER BY "createdAt" ASC, "id" ASC
          LIMIT $5`,
        [ORDER_STATUS_CHANGED_EVENT, NOTIFICATION_SENT_EVENT, sinceCreatedAt, sinceId, POLL_BATCH_SIZE],
      );
      rows = outboxResult.rows;

      const deliveredOrderIds = [
        ...new Set(
          rows
            .filter((row) => row.name === ORDER_STATUS_CHANGED_EVENT)
            .map((row) => row.payload as OrderStatusChangedPayload)
            .filter((payload) => payload.toStatus === 'DELIVERED')
            .map((payload) => payload.orderId),
        ),
      ];

      orderAmounts = new Map();
      if (deliveredOrderIds.length > 0) {
        const orderResult = await client.query<{ id: string; grandTotal: number }>(
          `SELECT "id", "grandTotal" FROM "Order" WHERE "id" = ANY($1)`,
          [deliveredOrderIds],
        );
        for (const order of orderResult.rows) orderAmounts.set(order.id, order.grandTotal);
      }
    } catch (error) {
      this.logger.error(`pollTenant(${tenantId}) failed to read the tenant's own outbox — deferred to next run`, error);
      await client.end();
      return { scanned: 0, metered: 0, reversed: 0 };
    }
    await client.end();

    if (rows.length === 0) return { scanned: 0, metered: 0, reversed: 0 };

    let metered = 0;
    let reversed = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        if (row.name === ORDER_STATUS_CHANGED_EVENT) {
          const payload = row.payload as OrderStatusChangedPayload;
          if (payload.toStatus === 'DELIVERED') {
            const grandTotal = orderAmounts.get(payload.orderId);
            if (grandTotal !== undefined) {
              const applied = await this.applyDeliveredFee(tx, tenantId, payload.orderId, grandTotal, transactionFeeBps, row.createdAt);
              if (applied) metered++;
            }
          } else if (payload.toStatus === 'RETURNED') {
            const applied = await this.applyReturnedReversal(tx, tenantId, payload.orderId);
            if (applied) reversed++;
          }
        } else if (row.name === NOTIFICATION_SENT_EVENT) {
          await this.incrementMeter(tx, tenantId, 'messages_sent', row.createdAt, 1);
        }
      }

      const last = rows[rows.length - 1];
      await tx.usageMeteringCursor.upsert({
        where: { tenantId },
        create: { tenantId, lastEventId: last.id, lastEventCreatedAt: last.createdAt },
        update: { lastEventId: last.id, lastEventCreatedAt: last.createdAt },
      });
    });

    return { scanned: rows.length, metered, reversed };
  }

  private async applyDeliveredFee(
    tx: PrismaTx,
    tenantId: string,
    orderId: string,
    grandTotalMinor: number,
    transactionFeeBps: number,
    eventCreatedAt: Date,
  ): Promise<boolean> {
    const existing = await tx.meteredOrderFee.findUnique({ where: { tenantId_orderId: { tenantId, orderId } } });
    if (existing) return false; // doc 153's own "second copy of the write" — a rescanned DELIVERED row metres no second fee.

    const feeMinor = Math.round((grandTotalMinor * transactionFeeBps) / 10_000);
    const { periodStart, periodEnd } = currentCalendarMonthPeriod(eventCreatedAt);

    await tx.meteredOrderFee.create({
      data: { tenantId, orderId, feeMinor, periodStart, periodEnd },
    });
    await this.incrementMeterInTx(tx, tenantId, 'transaction_fee_minor', periodStart, periodEnd, feeMinor);
    return true;
  }

  private async applyReturnedReversal(tx: PrismaTx, tenantId: string, orderId: string): Promise<boolean> {
    const fee = await tx.meteredOrderFee.findUnique({ where: { tenantId_orderId: { tenantId, orderId } } });
    if (!fee || fee.reversedAt) return false; // never metered (not USAGE_BASED at delivery time), or already reversed.

    // doc 153's own "undo fan-out": if the original period was already
    // invoiced, mutating that closed period's UsageMeter row would silently
    // change an already-issued invoice's own basis — issue a CreditNote
    // against it instead (BillingService.issueCreditNote(), reused, not
    // reinvented). Otherwise the period is still open and the reversal
    // folds straight back into the same UsageMeter row the eventual
    // invoice will read.
    const existingInvoice = await tx.platformInvoice.findUnique({
      where: { tenantId_periodStart_periodEnd: { tenantId, periodStart: fee.periodStart, periodEnd: fee.periodEnd } },
    });

    let reversalCreditNoteId: string | null = null;
    if (existingInvoice) {
      const creditNote = await tx.platformInvoiceCreditNote.create({
        data: {
          invoiceId: existingInvoice.id,
          amountMinor: fee.feeMinor,
          reason: `Order ${orderId} returned — transaction fee reversed`,
        },
      });
      await tx.platformInvoice.update({ where: { id: existingInvoice.id }, data: { status: 'CREDITED' } });
      reversalCreditNoteId = creditNote.id;
    } else {
      await this.incrementMeterInTx(tx, tenantId, 'transaction_fee_minor', fee.periodStart, fee.periodEnd, -fee.feeMinor);
    }

    await tx.meteredOrderFee.update({
      where: { id: fee.id },
      data: { reversedAt: new Date(), reversalCreditNoteId },
    });
    return true;
  }

  private async incrementMeter(tx: PrismaTx, tenantId: string, metric: string, eventCreatedAt: Date, delta: number): Promise<void> {
    const { periodStart, periodEnd } = currentCalendarMonthPeriod(eventCreatedAt);
    await this.incrementMeterInTx(tx, tenantId, metric, periodStart, periodEnd, delta);
  }

  private async incrementMeterInTx(
    tx: PrismaTx,
    tenantId: string,
    metric: string,
    periodStart: Date,
    periodEnd: Date,
    delta: number,
  ): Promise<void> {
    await tx.usageMeter.upsert({
      where: { tenantId_metric_periodStart: { tenantId, metric, periodStart } },
      create: { tenantId, metric, periodStart, periodEnd, quantity: delta },
      update: { quantity: { increment: delta } },
    });
  }

  /**
   * The periodic banded-allowance snapshot (WO-153.2's own "products
   * count, seat count via `countBillableSeats()`") — SETS (never
   * increments) the latest observed count for each count-at-rest
   * dimension. Reuses `SeatCounterService` exactly as shipped (its own
   * single-query, connection-per-call contract, unmodified); opens one
   * more, separate, equally short-lived connection for the products count,
   * following the identical pattern rather than widening
   * SeatCounterService's own narrow, already-reviewed contract.
   */
  async snapshotAllowances(tenantId: string): Promise<void> {
    const tenant = await this.prisma.platformTenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
    if (!tenant || tenant.plan.pricingModel !== 'USAGE_BASED') return;

    const [productsCount, seatsCount] = await Promise.all([
      this.countActiveProducts(tenantId),
      this.seatCounter.countBillableSeats(tenantId),
    ]);

    const { periodStart, periodEnd } = currentCalendarMonthPeriod();
    await this.prisma.$transaction([
      this.prisma.usageMeter.upsert({
        where: { tenantId_metric_periodStart: { tenantId, metric: 'products_count', periodStart } },
        create: { tenantId, metric: 'products_count', periodStart, periodEnd, quantity: productsCount },
        update: { quantity: productsCount },
      }),
      this.prisma.usageMeter.upsert({
        where: { tenantId_metric_periodStart: { tenantId, metric: 'seats_count', periodStart } },
        create: { tenantId, metric: 'seats_count', periodStart, periodEnd, quantity: seatsCount },
        update: { quantity: seatsCount },
      }),
    ]);
  }

  private async countActiveProducts(tenantId: string): Promise<number> {
    const connectionString = await this.credentials.resolveConnectionString(tenantId);
    const client = new Client({ connectionString, statement_timeout: CONNECT_STATEMENT_TIMEOUT_MS });
    await client.connect();
    try {
      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "Product" WHERE "status" = 'ACTIVE'`,
      );
      return Number(result.rows[0]?.count ?? '0');
    } catch (error) {
      this.logger.error(`countActiveProducts failed for tenant ${tenantId}`, error);
      throw error;
    } finally {
      await client.end();
    }
  }

  /** Every ACTIVE tenant on a USAGE_BASED plan — the sweep both
   *  `UsageMeteringCron` methods run over. */
  async listUsageBasedTenantIds(): Promise<string[]> {
    const tenants = await this.prisma.platformTenant.findMany({
      where: { status: 'ACTIVE', plan: { pricingModel: 'USAGE_BASED' } },
      select: { id: true },
    });
    return tenants.map((t) => t.id);
  }
}

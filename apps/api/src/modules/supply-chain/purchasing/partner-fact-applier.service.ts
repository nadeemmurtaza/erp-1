import { Injectable, Logger } from '@nestjs/common';
import { BRAND } from '@newax/shared';
import { DomainEvent } from '../../../core/events/domain-events';
import { EventBusService } from '../../../core/events/event-bus.service';
import { Prisma } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { SettingsService } from '../../../core/settings/settings.service';
import { planSaleFact, parseSaleFact, type SaleFact, type SaleFactPlan } from './partner-fact-plan';
import { PurchasingService } from './purchasing.service';

const FALLBACK_THRESHOLD_PERCENT = 25;

/** What applying a fact did. SKIPPED is the harmless answer to a repeat, a fact already settled, or one this module does not apply. */
export type ApplyResult = 'APPLIED' | 'REVIEW' | 'SKIPPED';

interface StoredFact {
  id: string;
  tradingPartnerId: string;
  factId: string;
  fact: SaleFact | null;
}

function isSourceFactViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes('sourceFactInboxId')
    : String(target ?? '').includes('sourceFactInboxId');
}

/**
 * WO-213.2 — applies a connected partner's `sale.dispatched` fact on the
 * buyer's side: a purchase order (the buyer's own number, the seller's price
 * as cost) and a supplier bill, or a named reason a person must look at it.
 *
 * Imports no other feature module. The fact is read from the inbox the
 * `tradingpartners` module owns the way `SupplierDigestListener` reads
 * `Supplier`, and the answer goes back as a domain event, never a write to
 * that module's table.
 *
 * Failure paths:
 *  - a repeat or redelivery: the unique `PurchaseOrder.sourceFactInboxId`
 *    makes the second order impossible; the attempt returns SKIPPED;
 *  - a fact already APPLIED or REJECTED: skipped without reading anything else;
 *  - anything that needs a person: `PartnerFactNeedsReview` with the reasons,
 *    nothing written;
 *  - an unexpected error (database, etc.) is thrown so the outbox retries the
 *    event with backoff; the order, bill and the "applied" event commit
 *    together or not at all.
 *
 * Stock does NOT move here. It moves when staff receive the goods
 * (`receiveGoods()`, untouched), because stock follows the physical event.
 */
@Injectable()
export class PartnerFactApplierService {
  private readonly logger = new Logger(PartnerFactApplierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly purchasing: PurchasingService,
    private readonly events: EventBusService,
    private readonly settings: SettingsService,
  ) {}

  async apply(inboxId: string): Promise<ApplyResult> {
    const stored = await this.load(inboxId);
    if (!stored) return 'SKIPPED';

    if (!stored.fact) {
      await this.parkForReview(stored, 'The stored fact could not be read, so nothing was applied.');
      return 'REVIEW';
    }

    const plan = await this.plan(stored, stored.fact);
    if (plan.outcome === 'REVIEW') {
      await this.parkForReview(stored, plan.reasons.join('\n'));
      return 'REVIEW';
    }

    const fact = stored.fact;
    try {
      await this.prisma.$transaction(async (tx) => {
        const order = await this.purchasing.createPurchaseOrder(
          {
            supplierId: plan.supplier.id,
            notes: `Created automatically from ${plan.supplier.name}'s dispatch fact ${fact.factId}${fact.documentRef ? ` (their document ${fact.documentRef})` : ''}.`,
            items: plan.lines.map((line) => ({
              variantId: line.variantId,
              quantityOrdered: line.quantity,
              unitCost: line.unitPriceMinor,
              note: line.name,
            })),
          },
          null,
          tx,
          { status: 'SENT', sourceFactInboxId: stored.id },
        );

        await this.purchasing.createSupplierBill(
          {
            supplierId: plan.supplier.id,
            purchaseOrderId: order.id,
            reference: fact.documentRef ?? `Fact ${fact.factId.slice(0, 8)}`,
            amount: plan.totalMinor,
            currency: fact.currency,
            notes: `Raised automatically from partner fact ${fact.factId}.`,
          },
          tx,
        );

        await this.events.publish(
          DomainEvent.PartnerFactApplied,
          {
            inboxId: stored.id,
            tradingPartnerId: stored.tradingPartnerId,
            factId: stored.factId,
            type: 'sale.dispatched',
            purchaseOrderId: order.id,
          },
          tx,
        );
      });
    } catch (error) {
      if (isSourceFactViolation(error)) {
        this.logger.log(
          `partner fact already has its purchase order, ignored: inbox=${stored.id} factId=${stored.factId}`,
        );
        return 'SKIPPED';
      }
      throw error;
    }

    this.logger.log(
      `partner fact applied: inbox=${stored.id} factId=${stored.factId} supplier=${plan.supplier.id} lines=${plan.lines.length} total=${plan.totalMinor}`,
    );
    return 'APPLIED';
  }

  /**
   * What `apply()` would do, without doing it: the same plan, no write, no
   * event. Returns null when there is nothing to plan (not a sale fact, not
   * found, already settled). The HTTP route that calls this ships with the
   * review screen (WO-213.5).
   */
  async preview(inboxId: string): Promise<SaleFactPlan | null> {
    const stored = await this.load(inboxId);
    if (!stored?.fact) return null;
    return this.plan(stored, stored.fact);
  }

  /** The inbox row, if it is a sale fact still waiting for an answer. */
  private async load(inboxId: string): Promise<StoredFact | null> {
    const row = await this.prisma.partnerFactInbox.findUnique({
      where: { id: inboxId },
      select: { id: true, tradingPartnerId: true, factId: true, type: true, status: true, payload: true },
    });
    if (!row || row.type !== 'sale.dispatched') return null;
    // RECEIVED is new; NEEDS_REVIEW is a retry after a person fixed what was
    // wrong. APPLIED and REJECTED are final.
    if (row.status !== 'RECEIVED' && row.status !== 'NEEDS_REVIEW') return null;
    return { id: row.id, tradingPartnerId: row.tradingPartnerId, factId: row.factId, fact: parseSaleFact(row.payload) };
  }

  private async plan(stored: StoredFact, fact: SaleFact): Promise<SaleFactPlan> {
    const suppliers = await this.prisma.supplier.findMany({
      where: { tradingPartnerId: stored.tradingPartnerId, isActive: true },
      select: { id: true, name: true, currency: true },
    });

    const gtins = [...new Set(fact.lines.map((line) => line.gtin).filter((g): g is string => !!g))];
    const variants = gtins.length
      ? await this.prisma.productVariant.findMany({
          where: { barcode: { in: gtins } },
          select: { id: true, barcode: true, costPrice: true, isActive: true },
        })
      : [];

    return planSaleFact({
      fact,
      suppliers,
      variantsByBarcode: new Map(
        variants.map((v) => [v.barcode as string, { id: v.id, costPrice: v.costPrice, isActive: v.isActive }]),
      ),
      baseCurrency: BRAND.locale.currency,
      thresholdPercent: await this.thresholdPercent(),
    });
  }

  private async thresholdPercent(): Promise<number> {
    const raw = await this.settings.get(SettingKey.PartnersPriceReviewThresholdPercent);
    return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : FALLBACK_THRESHOLD_PERCENT;
  }

  private async parkForReview(stored: StoredFact, reason: string): Promise<void> {
    await this.events.publish(DomainEvent.PartnerFactNeedsReview, {
      inboxId: stored.id,
      tradingPartnerId: stored.tradingPartnerId,
      factId: stored.factId,
      type: 'sale.dispatched',
      reason,
    });
    this.logger.log(`partner fact needs review: inbox=${stored.id} factId=${stored.factId}`);
  }
}

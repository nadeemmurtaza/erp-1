import { Injectable } from '@nestjs/common';
import type { StockMovementReason } from '../prisma/client';

export interface StockIntakeMove {
  variantId: string;
  /** Positive in, negative out. */
  delta: number;
  reason: StockMovementReason;
  refType?: string;
  refId?: string;
  note?: string;
  actorId?: string | null;
}

export interface StockIntakeHandler {
  defaultLocationId(): Promise<string>;
  move(input: StockIntakeMove & { locationId: string }): Promise<void>;
}

/**
 * Lets a module record a stock movement — set a newly-imported product's
 * opening stock, say — without importing `inventory` directly.
 *
 * This is the core-internal counterpart to CartLineValidatorRegistry and
 * EntityEnrichmentRegistry: those decouple core from a sector pack, this one
 * decouples two core modules from each other for a BEST-EFFORT write —
 * `product-import.service.ts`'s CSV-driven stock write goes through this
 * registry rather than injecting `InventoryService` directly, since it runs
 * one row at a time outside any transaction. `catalog` still keeps a direct
 * `InventoryService` import too, for the unrelated case where it genuinely
 * needs the same guarantee orders and purchasing do — see
 * `product-admin.service.ts`'s create()/syncVariants(), which write stock
 * inside the same Prisma transaction as the product/variant write that
 * caused it (`catalog -> inventory` in KNOWN_MODULE_COUPLINGS,
 * scripts/check-module-boundaries.mjs). `inventory` registers itself from
 * its own `onModuleInit()`.
 *
 * Not for order placement, a purchase-order receipt, or anything else that
 * must commit in the SAME database transaction as the write that caused it —
 * those stay direct NestJS imports on purpose (see orders.module.ts and
 * purchasing.service.ts), because a registered handler here runs outside any
 * transaction the caller might be in. Use this only where "the stock write
 * didn't happen yet" is an acceptable, correctable state, the same way a
 * skipped CSV row already is.
 *
 * A deployment that excludes `inventory` from MODULES simply never gets a
 * handler registered — recordIntake() then no-ops rather than failing, the
 * same graceful-absence behaviour every other extension point in this file
 * gives a switched-off module.
 */
@Injectable()
export class StockIntakeRegistry {
  private handler: StockIntakeHandler | null = null;

  /** Called once, from inventory's own `onModuleInit()`. */
  register(handler: StockIntakeHandler): void {
    this.handler = handler;
  }

  /** Null when nothing is registered — the caller decides what "no inventory" means for it. */
  async defaultLocationId(): Promise<string | null> {
    return this.handler ? this.handler.defaultLocationId() : null;
  }

  /** A no-op when nothing is registered. */
  async recordIntake(move: StockIntakeMove & { locationId: string }): Promise<void> {
    if (!this.handler) return;
    await this.handler.move(move);
  }
}

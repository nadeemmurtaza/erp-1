import { Injectable } from '@nestjs/common';

/**
 * One line of what an auction winner owes, in minor units of the invoice's
 * currency. The auction hands over amounts and names; it never prices anything
 * and never learns how an order is shaped.
 */
export interface AuctionInvoiceLine {
  /** What the customer reads on the order. */
  name: string;
  /** `GOODS` for the lot, `SERVICE` for a fee on top of it. */
  kind: 'GOODS' | 'SERVICE';
  /** Whole minor units, never negative. */
  amountMinor: number;
}

export interface AuctionInvoiceRequest {
  /**
   * What the order is for, and the key that makes asking again safe: the same
   * `(sourceType, sourceRef)` always yields the same order. An auction settlement
   * sends `('AUCTION_SETTLEMENT', <settlement id>)`.
   */
  sourceType: string;
  sourceRef: string;
  /** The portal account that owes it. */
  userId: string;
  currency: string;
  lines: AuctionInvoiceLine[];
  /** A payment method key the shop accepts (`bank_transfer`, `cod`, …). */
  paymentMethod: string;
  /** Shown to staff on the order, never to the customer. */
  note?: string;
}

export interface AuctionInvoice {
  orderId: string;
  orderNumber: string;
  /** What the order came to, in minor units. */
  totalMinor: number;
}

/**
 * What a module that owns orders offers an auction (doc 234 §9, §10). Both
 * calls are idempotent: asking for the same source twice returns the first
 * invoice, and cancelling a cancelled order is a no-op.
 */
export interface AuctionOrderSink {
  invoice(request: AuctionInvoiceRequest): Promise<AuctionInvoice>;
  /** Ends an unpaid invoice. A no-op for an order already cancelled; refuses one that was paid. */
  cancel(orderId: string, reason: string): Promise<void>;
}

/**
 * A request the sink understood and will not do, with a code a person can act
 * on. Anything else a sink throws is an accident and is retried; this is a
 * decision, so the auction records it and waits for a human.
 */
export class AuctionInvoiceRejectedError extends Error {
  constructor(
    readonly code: 'ABOVE_ORDER_LIMIT' | 'NO_SUCH_CUSTOMER' | 'PAYMENT_METHOD_UNAVAILABLE' | 'NOTHING_TO_INVOICE',
    message: string,
  ) {
    super(message);
    this.name = 'AuctionInvoiceRejectedError';
  }
}

/** No module has registered as the sink: the deployment has no orders module, or has not started it. */
export class AuctionOrderSinkUnavailableError extends Error {
  constructor() {
    super('This shop is not set up to invoice auction winners: the orders module is not running.');
    this.name = 'AuctionOrderSinkUnavailableError';
  }
}

/**
 * Lets the Auction app turn a win into an order without importing `orders`
 * (doc 234 §10, CLAUDE.md "modules are independent"). `orders` registers itself
 * from its own `onModuleInit()`, the way `inventory` registers as the stock
 * intake; the auction calls `invoice()` and keeps only the order's id and number.
 *
 * Handlers run outside the caller's transaction, which is fine here and is why
 * the idempotency key exists: a crash between "the order was made" and "the
 * auction wrote its id down" is repaired by asking again, not by a rollback.
 *
 * A deployment without the `orders` module never registers a sink. `isReady()`
 * says so, and `invoice()` then throws `AuctionOrderSinkUnavailableError`
 * rather than pretending a win was invoiced.
 */
@Injectable()
export class AuctionOrderSinkRegistry {
  private sink: AuctionOrderSink | null = null;

  /** Called once, from the orders module's own `onModuleInit()`. */
  register(sink: AuctionOrderSink): void {
    this.sink = sink;
  }

  isReady(): boolean {
    return this.sink !== null;
  }

  async invoice(request: AuctionInvoiceRequest): Promise<AuctionInvoice> {
    if (!this.sink) throw new AuctionOrderSinkUnavailableError();
    return this.sink.invoice(request);
  }

  async cancel(orderId: string, reason: string): Promise<void> {
    if (!this.sink) throw new AuctionOrderSinkUnavailableError();
    await this.sink.cancel(orderId, reason);
  }
}

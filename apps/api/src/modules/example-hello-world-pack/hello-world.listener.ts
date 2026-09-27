import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, type OrderPlacedPayload } from '../../core/events/domain-events';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';

/**
 * docs/implementation/SDK-CONTRACT.md — a genuine "hello world," not a
 * disguised real feature: subscribes to exactly one documented, stable
 * domain event through the one seam `SDK-CONTRACT.md` publishes
 * (`@OnDomainEvent`), reads nothing from another module's internals, writes
 * nothing to any table, and calls no other module's service. It exists only
 * to prove — and to be lint-checked as proof (WO-37.4's own acceptance
 * criterion) — that a pack built strictly to the published contract needs
 * zero edits to `core` or to any other pack.
 *
 * This is demonstration code. Registered `offByDefault: true`
 * (modules.registry.ts) in every deployment; never enable it in a real
 * client's MODULES= list.
 */
@Injectable()
export class HelloWorldListener {
  private readonly logger = new Logger(HelloWorldListener.name);

  @OnDomainEvent(DomainEvent.OrderPlaced)
  async onOrderPlaced(payload: OrderPlacedPayload): Promise<void> {
    this.logger.log(`[example-hello-world-pack] saw order.placed for order ${payload.orderId} — the SDK contract works.`);
  }
}

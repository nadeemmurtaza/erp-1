import { OnEvent } from '@nestjs/event-emitter';
import type { DomainEventName } from './domain-events';

/**
 * Subscribes a method to a domain event.
 *
 *   @OnDomainEvent(DomainEvent.OrderPlaced)
 *   async handle(payload: OrderPlacedPayload) { … }
 *
 * Handlers must be idempotent: outbox delivery is at-least-once, so the same
 * event can arrive twice after a retry. Throwing schedules a retry; returning
 * normally marks the event delivered.
 */
export const OnDomainEvent = (event: DomainEventName): MethodDecorator =>
  OnEvent(event, { async: true, promisify: true });

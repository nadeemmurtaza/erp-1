import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../prisma/client';
import type { DomainEventName, DomainEventPayloads } from './domain-events';

/** Anything that can run a query: the PrismaService or an open transaction. */
export type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * Publishes domain events through a transactional outbox.
 *
 * `publish()` takes the transaction client, so the event row is written in the
 * SAME transaction as the state change that produced it. Either the order and
 * its event both exist, or neither does — no "order saved but the tailor job
 * was never created" state.
 *
 * The OutboxDispatcher then delivers pending rows to subscribers, retrying with
 * backoff. Delivery is at-least-once, so subscribers must be idempotent.
 */
@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: EventEmitter2,
  ) {}

  /**
   * Queues an event for delivery. Pass the transaction client when publishing
   * from inside `prisma.$transaction`.
   */
  async publish<K extends DomainEventName>(
    name: K,
    payload: DomainEventPayloads[K],
    tx: PrismaLike = this.prisma,
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: { name, payload: payload as unknown as Prisma.InputJsonValue },
    });
    this.logger.debug(`queued ${name}`);
  }

  /**
   * Delivers an event to in-process subscribers. Called by the dispatcher, not
   * by domain code — publish() is the entry point.
   */
  async dispatch(name: string, payload: unknown): Promise<void> {
    await this.emitter.emitAsync(name, payload);
  }
}

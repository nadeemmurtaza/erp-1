import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainEvent } from '../events/domain-events';
import { OnDomainEvent } from '../events/on-domain-event.decorator';
import { ECOSYSTEM_EVENT_BUS_CLIENT } from './ecosystem.constants';
import type { EcosystemEventBusClient } from './ecosystem-event-bus.client';

/**
 * Bridges internal domain events dispatched by the transactional outbox
 * to the central core-newax Event Bus.
 *
 * This allows external domains (Communicator for customer messaging, newcom/esp
 * for outbound transactional emails) to react to commercial facts without erp-1
 * calling them directly or owning customer communications.
 */
@Injectable()
export class EcosystemEventBridgeService {
  private readonly logger = new Logger(EcosystemEventBridgeService.name);

  constructor(
    @Inject(ECOSYSTEM_EVENT_BUS_CLIENT)
    private readonly eventBusClient: EcosystemEventBusClient,
  ) {}

  @OnDomainEvent(DomainEvent.OrderPlaced)
  async handleOrderPlaced(payload: unknown): Promise<void> {
    await this.forward(DomainEvent.OrderPlaced, payload);
  }

  @OnDomainEvent(DomainEvent.OrderStatusChanged)
  async handleOrderStatusChanged(payload: unknown): Promise<void> {
    await this.forward(DomainEvent.OrderStatusChanged, payload);
  }

  @OnDomainEvent(DomainEvent.OrderCancelled)
  async handleOrderCancelled(payload: unknown): Promise<void> {
    await this.forward(DomainEvent.OrderCancelled, payload);
  }

  @OnDomainEvent(DomainEvent.PaymentSucceeded)
  async handlePaymentSucceeded(payload: unknown): Promise<void> {
    await this.forward(DomainEvent.PaymentSucceeded, payload);
  }

  @OnDomainEvent(DomainEvent.PaymentFailed)
  async handlePaymentFailed(payload: unknown): Promise<void> {
    await this.forward(DomainEvent.PaymentFailed, payload);
  }

  @OnDomainEvent(DomainEvent.PaymentRefunded)
  async handlePaymentRefunded(payload: unknown): Promise<void> {
    await this.forward(DomainEvent.PaymentRefunded, payload);
  }

  @OnDomainEvent(DomainEvent.UserRegistered)
  async handleUserRegistered(payload: unknown): Promise<void> {
    await this.forward(DomainEvent.UserRegistered, payload);
  }

  @OnDomainEvent(DomainEvent.StitchingJobCreated)
  async handleStitchingJobCreated(payload: unknown): Promise<void> {
    await this.forward(DomainEvent.StitchingJobCreated, payload);
  }

  @OnDomainEvent(DomainEvent.StitchingJobStageChanged)
  async handleStitchingJobStageChanged(payload: unknown): Promise<void> {
    await this.forward(DomainEvent.StitchingJobStageChanged, payload);
  }

  private async forward(eventName: string, payload: unknown): Promise<void> {
    try {
      await this.eventBusClient.publish(eventName, payload);
    } catch (error) {
      this.logger.error(
        `Failed to bridge domain event "${eventName}" to central event bus: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

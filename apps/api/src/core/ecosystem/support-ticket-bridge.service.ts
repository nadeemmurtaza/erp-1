import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import {
  ECOSYSTEM_EVENT_BUS_CLIENT,
  ECOSYSTEM_MODULE_GATEWAY_CLIENT,
  type EcosystemEventBusClient,
  type EcosystemModuleGatewayClient,
} from './ecosystem.constants';

export interface DelegatedTicketPayload {
  ticketId: string;
  customerId?: string | null;
  raisedByUserId?: string;
  subject: string;
  category: string;
  priority?: string;
  body?: string;
  orderId?: string | null;
  tenantId?: string;
  organizationId?: string;
}

export interface DelegatedTicketResult {
  delegated: boolean;
  externalService?: 'Communicator';
  deepLinkUrl?: string;
  eventDispatched?: boolean;
}

/**
 * SupportTicketBridge (ECOSYSTEM.md, WO-255.5).
 *
 * Decouples customer support ticketing from erp-1 by delegating customer
 * conversations and tickets to Communicator via the central Event Bus
 * (`support.ticket.created`) or synchronous Module Gateway.
 *
 * When ECOSYSTEM_ENABLED=true, ticket lifecycle and customer notifications
 * are owned by Communicator, with erp-1 retaining only commercial linkbacks.
 */
@Injectable()
export class SupportTicketBridge {
  private readonly logger = new Logger(SupportTicketBridge.name);

  constructor(
    private readonly config: AppConfigService,
    @Inject(ECOSYSTEM_EVENT_BUS_CLIENT)
    private readonly eventBus: EcosystemEventBusClient,
    @Inject(ECOSYSTEM_MODULE_GATEWAY_CLIENT)
    private readonly gateway: EcosystemModuleGatewayClient,
  ) {}

  /**
   * Delegates ticket creation to Communicator via cross-repo event bus and gateway.
   */
  async delegateTicket(ticket: DelegatedTicketPayload): Promise<DelegatedTicketResult> {
    const isEcosystemEnabled = this.config.get('ECOSYSTEM_ENABLED');

    if (!isEcosystemEnabled) {
      return { delegated: false };
    }

    this.logger.log(
      `[WO-255.5] Delegating support ticket '${ticket.ticketId}' (Subject: "${ticket.subject}") to Communicator.`,
    );

    // 1. Asynchronous cross-domain event broadcast
    const eventDispatched = await this.eventBus.publish('support.ticket.created', {
      ticketId: ticket.ticketId,
      customerId: ticket.customerId,
      raisedByUserId: ticket.raisedByUserId,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority ?? 'NORMAL',
      body: ticket.body,
      orderId: ticket.orderId,
      tenantId: ticket.tenantId,
      organizationId: ticket.organizationId,
      createdAt: new Date().toISOString(),
    });

    // 2. Synchronous registration with Communicator via core-newax Module Gateway
    await this.gateway.call({
      targetModule: 'Communicator',
      action: 'syncTicket',
      tenantId: ticket.tenantId,
      organizationId: ticket.organizationId,
      payload: {
        ticketId: ticket.ticketId,
        customerId: ticket.customerId,
        subject: ticket.subject,
        category: ticket.category,
      },
    });

    return {
      delegated: true,
      externalService: 'Communicator',
      deepLinkUrl: this.getTicketDeepLink(ticket.ticketId),
      eventDispatched,
    };
  }

  /**
   * Generates a deep link URL to view/handle the ticket inside Communicator's unified inbox.
   */
  getTicketDeepLink(ticketId: string): string {
    const communicatorUrl =
      process.env.COMMUNICATOR_WEB_URL || 'http://localhost:3002/inbox/tickets';
    return `${communicatorUrl.replace(/\/+$/, '')}/${encodeURIComponent(ticketId)}`;
  }
}

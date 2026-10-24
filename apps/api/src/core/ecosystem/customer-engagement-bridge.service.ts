import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import {
  ECOSYSTEM_MODULE_GATEWAY_CLIENT,
  type EcosystemModuleGatewayClient,
} from './ecosystem.constants';

export interface CustomerHistoryResult {
  available: boolean;
  externalService?: 'Communicator';
  embedUrl?: string;
  conversations: Array<{
    id: string;
    channel: string;
    subject?: string;
    lastMessageAt: string;
    status: string;
  }>;
}

/**
 * CustomerEngagementBridge (ECOSYSTEM.md, WO-255.5).
 *
 * Delegates customer CRM conversation timelines and interaction histories
 * to Communicator via the central Module Gateway.
 *
 * When ECOSYSTEM_ENABLED=true, CRM history queries route through the gateway
 * to Communicator, and the admin UI renders a direct embedded deep-link into
 * Communicator's contact workspace rather than managing duplicated chats locally.
 */
@Injectable()
export class CustomerEngagementBridge {
  private readonly logger = new Logger(CustomerEngagementBridge.name);

  constructor(
    private readonly config: AppConfigService,
    @Inject(ECOSYSTEM_MODULE_GATEWAY_CLIENT)
    private readonly gateway: EcosystemModuleGatewayClient,
  ) {}

  /**
   * Fetches customer conversation and engagement history from Communicator.
   */
  async fetchCustomerTimeline(
    customerId: string,
    options?: { tenantId?: string; organizationId?: string },
  ): Promise<CustomerHistoryResult> {
    const isEcosystemEnabled = this.config.get('ECOSYSTEM_ENABLED');

    if (!isEcosystemEnabled) {
      return {
        available: false,
        conversations: [],
      };
    }

    try {
      const response = await this.gateway.call<
        { customerId: string },
        {
          conversations: Array<{
            id: string;
            channel: string;
            subject?: string;
            lastMessageAt: string;
            status: string;
          }>;
        }
      >({
        targetModule: 'Communicator',
        action: 'getContactTimeline',
        tenantId: options?.tenantId,
        organizationId: options?.organizationId,
        payload: { customerId },
      });

      if (response.success && response.data?.conversations) {
        return {
          available: true,
          externalService: 'Communicator',
          embedUrl: this.getCommunicatorEmbedUrl(customerId),
          conversations: response.data.conversations,
        };
      }

      return {
        available: true,
        externalService: 'Communicator',
        embedUrl: this.getCommunicatorEmbedUrl(customerId),
        conversations: [],
      };
    } catch (error) {
      this.logger.warn(
        `[WO-255.5] Failed to fetch contact timeline for '${customerId}' from Communicator: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        available: false,
        embedUrl: this.getCommunicatorEmbedUrl(customerId),
        conversations: [],
      };
    }
  }

  /**
   * Generates the embed / deep-link URL for embedding Communicator in the ERP-1 Admin UI.
   */
  getCommunicatorEmbedUrl(customerId: string): string {
    const communicatorUrl =
      process.env.COMMUNICATOR_WEB_URL || 'http://localhost:3002/contacts';
    return `${communicatorUrl.replace(/\/+$/, '')}/${encodeURIComponent(customerId)}`;
  }
}

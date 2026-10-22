import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import {
  ECOSYSTEM_EVENT_BUS_CLIENT,
  ECOSYSTEM_MODULE_GATEWAY_CLIENT,
  type EcosystemEventBusClient,
  type EcosystemModuleGatewayClient,
} from './ecosystem.constants';

export interface CampaignDispatchPayload {
  campaignId: string;
  name: string;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';
  audienceSegmentId?: string;
  scheduledAt?: string;
  tenantId?: string;
  organizationId?: string;
  metadata?: Record<string, unknown>;
}

export interface CampaignDispatchResult {
  delegated: boolean;
  externalEngine?: 'Communicator' | 'newcom';
  dispatchedToEventBus?: boolean;
}

/**
 * MarketingDispatchBridge (ECOSYSTEM.md, WO-255.6).
 *
 * Decouples bulk marketing campaign execution from erp-1 in favor of Communicator
 * (for customer conversations, SMS, WhatsApp broadcasts) and newcom/esp
 * (for email deliverability, DKIM, MTA pooling).
 *
 * Catalog discounts, pricing rules, and promotions remain in erp-1 (Doc 146/promotions),
 * while external broadcast dispatches are delegated through the central Event Bus.
 */
@Injectable()
export class MarketingDispatchBridge {
  private readonly logger = new Logger(MarketingDispatchBridge.name);

  constructor(
    private readonly config: AppConfigService,
    @Inject(ECOSYSTEM_EVENT_BUS_CLIENT)
    private readonly eventBus: EcosystemEventBusClient,
    @Inject(ECOSYSTEM_MODULE_GATEWAY_CLIENT)
    private readonly gateway: EcosystemModuleGatewayClient,
  ) {}

  /**
   * Delegates a campaign broadcast to Communicator / newcom via event bus and gateway.
   */
  async delegateCampaign(campaign: CampaignDispatchPayload): Promise<CampaignDispatchResult> {
    const isEcosystemEnabled = this.config.get('ECOSYSTEM_ENABLED');

    if (!isEcosystemEnabled) {
      return { delegated: false };
    }

    const targetEngine = campaign.channel === 'EMAIL' ? 'newcom' : 'Communicator';

    this.logger.log(
      `[WO-255.6] Delegating marketing campaign '${campaign.campaignId}' (${campaign.name}, Channel: ${campaign.channel}) to ${targetEngine}.`,
    );

    // 1. Publish cross-repo domain event
    const dispatchedToEventBus = await this.eventBus.publish('marketing.campaign.dispatched', {
      campaignId: campaign.campaignId,
      name: campaign.name,
      channel: campaign.channel,
      audienceSegmentId: campaign.audienceSegmentId,
      targetEngine,
      tenantId: campaign.tenantId,
      organizationId: campaign.organizationId,
      dispatchedAt: new Date().toISOString(),
    });

    // 2. Notify target engine via Module Gateway
    await this.gateway.call({
      targetModule: targetEngine,
      action: 'queueCampaign',
      tenantId: campaign.tenantId,
      organizationId: campaign.organizationId,
      payload: {
        campaignId: campaign.campaignId,
        channel: campaign.channel,
      },
    });

    return {
      delegated: true,
      externalEngine: targetEngine,
      dispatchedToEventBus,
    };
  }
}

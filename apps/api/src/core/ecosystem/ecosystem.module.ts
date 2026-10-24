import { Global, Module } from '@nestjs/common';
import {
  ECOSYSTEM_EVENT_BUS_CLIENT,
  ECOSYSTEM_MODULE_GATEWAY_CLIENT,
} from './ecosystem.constants';
import { EcosystemController } from './ecosystem.controller';
import { EcosystemEventBridgeService } from './ecosystem-event-bridge.service';
import { HttpEcosystemEventBusClient } from './ecosystem-event-bus.client';
import { EcosystemInboundService } from './ecosystem-inbound.service';
import { HttpEcosystemModuleGatewayClient } from './ecosystem-module-gateway.client';
import { SupportTicketBridge } from './support-ticket-bridge.service';
import { CustomerEngagementBridge } from './customer-engagement-bridge.service';
import { MarketingDispatchBridge } from './marketing-dispatch-bridge.service';

/**
 * Global NEWAX Ecosystem Module.
 *
 * Provides the Module Gateway Client (for synchronous RPC through core-newax),
 * the Event Bus Client & Outbox Bridge (for cross-repo async domain events),
 * the Inbound Ecosystem Webhook Controller (for incoming cross-repo events),
 * and Decoupled Domain Bridges (SupportTicketBridge, CustomerEngagementBridge,
 * MarketingDispatchBridge for WO-255.5 / WO-255.6).
 */
@Global()
@Module({
  controllers: [EcosystemController],
  providers: [
    HttpEcosystemModuleGatewayClient,
    {
      provide: ECOSYSTEM_MODULE_GATEWAY_CLIENT,
      useExisting: HttpEcosystemModuleGatewayClient,
    },
    HttpEcosystemEventBusClient,
    {
      provide: ECOSYSTEM_EVENT_BUS_CLIENT,
      useExisting: HttpEcosystemEventBusClient,
    },
    EcosystemEventBridgeService,
    EcosystemInboundService,
    SupportTicketBridge,
    CustomerEngagementBridge,
    MarketingDispatchBridge,
  ],
  exports: [
    ECOSYSTEM_MODULE_GATEWAY_CLIENT,
    ECOSYSTEM_EVENT_BUS_CLIENT,
    HttpEcosystemModuleGatewayClient,
    HttpEcosystemEventBusClient,
    EcosystemEventBridgeService,
    EcosystemInboundService,
    SupportTicketBridge,
    CustomerEngagementBridge,
    MarketingDispatchBridge,
  ],
})
export class EcosystemModule {}

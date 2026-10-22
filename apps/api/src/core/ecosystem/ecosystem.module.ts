import { Global, Module } from '@nestjs/common';
import {
  ECOSYSTEM_EVENT_BUS_CLIENT,
  ECOSYSTEM_MODULE_GATEWAY_CLIENT,
} from './ecosystem.constants';
import { EcosystemController } from './ecosystem.controller';
import { EcosystemEventBridgeService } from './ecosystem-event-bridge.service';
import { EcosystemEventBusClient, HttpEcosystemEventBusClient } from './ecosystem-event-bus.client';
import { EcosystemInboundService } from './ecosystem-inbound.service';
import { EcosystemModuleGatewayClient, HttpEcosystemModuleGatewayClient } from './ecosystem-module-gateway.client';

/**
 * Global NEWAX Ecosystem Module.
 *
 * Provides the Module Gateway Client (for synchronous RPC through core-newax),
 * the Event Bus Client & Outbox Bridge (for cross-repo async domain events),
 * and the Inbound Ecosystem Webhook Controller (for incoming cross-repo events).
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
  ],
  exports: [
    ECOSYSTEM_MODULE_GATEWAY_CLIENT,
    ECOSYSTEM_EVENT_BUS_CLIENT,
    HttpEcosystemModuleGatewayClient,
    HttpEcosystemEventBusClient,
    EcosystemEventBridgeService,
    EcosystemInboundService,
  ],
})
export class EcosystemModule {}

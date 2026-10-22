import { Global, Module } from '@nestjs/common';
import {
  ECOSYSTEM_EVENT_BUS_CLIENT,
  ECOSYSTEM_MODULE_GATEWAY_CLIENT,
} from './ecosystem.constants';
import { EcosystemEventBridgeService } from './ecosystem-event-bridge.service';
import { HttpEcosystemEventBusClient } from './ecosystem-event-bus.client';
import { HttpEcosystemModuleGatewayClient } from './ecosystem-module-gateway.client';

/**
 * Global NEWAX Ecosystem Module.
 *
 * Provides the Module Gateway Client (for synchronous RPC through core-newax)
 * and the Event Bus Client & Outbox Bridge (for cross-repo async domain events).
 */
@Global()
@Module({
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
  ],
  exports: [
    ECOSYSTEM_MODULE_GATEWAY_CLIENT,
    ECOSYSTEM_EVENT_BUS_CLIENT,
    HttpEcosystemModuleGatewayClient,
    HttpEcosystemEventBusClient,
    EcosystemEventBridgeService,
  ],
})
export class EcosystemModule {}

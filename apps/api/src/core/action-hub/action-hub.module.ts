import { Global, Module } from '@nestjs/common';
import { ActionHubRegistryService } from './action-hub-registry.service';
import { ActionHubController } from './action-hub.controller';

/**
 * The manager action hub's extension point
 * (admin-platform/44-manager-action-hub.md, WO-44.1/44.3). Global, like
 * every other core module — a feature module injects
 * `ActionHubRegistryService` directly and registers its own source from
 * its own `onModuleInit()`, without this module importing it.
 */
@Global()
@Module({
  controllers: [ActionHubController],
  providers: [ActionHubRegistryService],
  exports: [ActionHubRegistryService],
})
export class ActionHubModule {}

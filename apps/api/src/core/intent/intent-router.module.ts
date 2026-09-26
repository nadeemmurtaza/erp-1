import { Global, Module } from '@nestjs/common';
import { IntentRouterService } from './intent-router.service';

/** Global, same as ExtensionPointsModule — a feature module injects IntentRouterService with no import needed, and registers its own intents from its own onModuleInit(). */
@Global()
@Module({
  providers: [IntentRouterService],
  exports: [IntentRouterService],
})
export class IntentRouterModule {}

import { Global, Module } from '@nestjs/common';
import { FeedRegistryService } from './feed-registry.service';
import { FeedController } from './feed.controller';

/**
 * The live operational feed's extension point
 * (analytics-reporting/58-live-operational-feed.md, WO-58.1/58.3). Global,
 * like `ActionHubModule` — a feature module injects `FeedRegistryService`
 * directly and registers its own source from its own `onModuleInit()`,
 * without this module importing it.
 */
@Global()
@Module({
  controllers: [FeedController],
  providers: [FeedRegistryService],
  exports: [FeedRegistryService],
})
export class FeedModule {}

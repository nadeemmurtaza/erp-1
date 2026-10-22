import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ActionHubModule } from './action-hub/action-hub.module';
import { AiModule } from './ai/ai.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AppConfigModule } from './config/config.module';
import { EventsModule } from './events/events.module';
import { ExtensionPointsModule } from './extension-points/extension-points.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { FeedModule } from './feed/feed.module';
import { HealthModule } from './health/health.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { IntentRouterModule } from './intent/intent-router.module';
import { LaunchpadModule } from './launchpad/launchpad.module';
import { MetricsModule } from './metrics/metrics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { ReplicationModule } from './replication/replication.module';
import { ResilienceModule } from './resilience/resilience.module';
import { SettingsModule } from './settings/settings.module';
import { SloModule } from './slo/slo.module';
import { StorageModule } from './storage/storage.module';
import { VersioningModule } from './versioning/versioning.module';
import { EcosystemModule } from './ecosystem/ecosystem.module';
import { CryptoModule } from './crypto/crypto.module';
import { AnaxModule } from './anax/anax.module';

/**
 * Everything a feature module is allowed to depend on.
 *
 * These are all @Global, so a feature module injects SettingsService or
 * EventBusService without importing anything — which is what keeps feature
 * modules from importing each other.
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    ScheduleModule.forRoot(),
    EventsModule,
    ExtensionPointsModule,
    ReplicationModule,
    SettingsModule,
    FeatureFlagsModule,
    StorageModule,
    NotificationsModule,
    AiModule,
    IntentRouterModule,
    ApprovalsModule,
    AuditModule,
    AuthModule,
    HealthModule,
    IdempotencyModule,
    MetricsModule,
    ActionHubModule,
    LaunchpadModule,
    FeedModule,
    VersioningModule,
    ResilienceModule,
    SloModule,
    EcosystemModule,
    CryptoModule,
    AnaxModule,
  ],
})
export class CoreModule {}

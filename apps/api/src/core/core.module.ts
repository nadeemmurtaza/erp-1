import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AiModule } from './ai/ai.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AppConfigModule } from './config/config.module';
import { EventsModule } from './events/events.module';
import { ExtensionPointsModule } from './extension-points/extension-points.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReplicationModule } from './replication/replication.module';
import { SettingsModule } from './settings/settings.module';
import { StorageModule } from './storage/storage.module';

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
    ScheduleModule.forRoot(),
    EventsModule,
    ExtensionPointsModule,
    ReplicationModule,
    SettingsModule,
    StorageModule,
    NotificationsModule,
    AiModule,
    AuditModule,
    AuthModule,
    HealthModule,
  ],
})
export class CoreModule {}

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './core/config/config.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { PlatformNotificationsModule } from './core/notifications/notifications.module';
import { TenantCredentialResolverModule } from './core/tenant-credentials/tenant-credential-resolver.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { SupportAccessModule } from './modules/support-access/support-access.module';
import { ResourceQuotasModule } from './modules/resource-quotas/resource-quotas.module';
import { BillingModule } from './modules/billing/billing.module';
import { TrialsModule } from './modules/trials/trials.module';
import { UiModule } from './modules/ui/ui.module';
import { AgencyModule } from './modules/agency/agency.module';
import { ProductReferenceModule } from './modules/product-reference/product-reference.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    PlatformNotificationsModule,
    TenantCredentialResolverModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 300 }],
      // Same rule apps/api's own AppModule states: never skipped outside
      // tests, so this always enforces the "at the edge" rate limit WO-51.2
      // names for the public signup endpoints (which also carry their own
      // tighter per-route @Throttle).
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    // TenantsModule already imports TenantDataModule and RoutingModule —
    // listed here anyway for readability of "what this app boots," Nest
    // dedups the same module reached through two import paths.
    TenantsModule,
    SupportAccessModule,
    ResourceQuotasModule,
    BillingModule,
    TrialsModule,
    UiModule,
    AgencyModule,
    ProductReferenceModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

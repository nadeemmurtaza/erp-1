import { Module } from '@nestjs/common';
import { TenantCredentialResolverModule } from '../../core/tenant-credentials/tenant-credential-resolver.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AgencyClientsController } from './agency-clients.controller';
import { AgencyClientsService } from './agency-clients.service';
import { AgencyApiKeyGuard } from './agency-api-key.guard';
import { AgencyKeyThrottlerGuard } from './agency-key-throttler.guard';
import { AgencyReportingController } from './agency-reporting.controller';
import { AgencyReportingService } from './agency-reporting.service';
import { AgencyUsageService } from './agency-usage.service';
import { AgencyUsageCron } from './agency-usage.cron';
import { StalwartAdminClient } from './stalwart-admin.client';
import { AgencyStripeService } from './agency-stripe.service';
import { AgencyStripeChargeCron } from './agency-stripe-charge.cron';
import { AgencyStripeWebhookController } from './agency-stripe-webhook.controller';

/**
 * doc 14 (commercial-licensing-agency/14-managed-services-module.md) — the
 * Master-Platform-side "agency" capability. Classified `core` (never a
 * sector pack) in the same sense `apps/platform` itself is core
 * infrastructure — there is no module-pack allowlist in this app at all,
 * `scripts/check-module-boundaries.mjs` only ever scans `apps/api`, and
 * this module is never reachable from a client's own extracted repo: its
 * counterpart there is the separate, much smaller `managed-services`
 * module in `apps/api` (`agency-reporting.controller.ts`'s own doc
 * comment). Imports `TenantsModule` to reuse `TenantsService.suspend()`/
 * `.reactivate()` from the Stripe webhook rather than duplicating tenant
 * status transitions here (ADR-039).
 */
@Module({
  imports: [TenantCredentialResolverModule, TenantsModule],
  controllers: [AgencyClientsController, AgencyReportingController, AgencyStripeWebhookController],
  providers: [
    AgencyClientsService,
    AgencyApiKeyGuard,
    AgencyKeyThrottlerGuard,
    AgencyReportingService,
    AgencyUsageService,
    AgencyUsageCron,
    StalwartAdminClient,
    AgencyStripeService,
    AgencyStripeChargeCron,
  ],
})
export class AgencyModule {}

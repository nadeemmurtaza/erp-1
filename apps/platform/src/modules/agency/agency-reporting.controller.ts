import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AgencyApiKeyGuard } from './agency-api-key.guard';
import { AgencyKeyThrottlerGuard } from './agency-key-throttler.guard';
import { CurrentAgencyClient } from './decorators';
import { AgencyReportingService } from './agency-reporting.service';
import type { PlatformTenant } from '../../core/prisma/client';

/**
 * WO-14.3 — `GET /agency/clients/me/{usage,invoices}`, doc 14's own read-
 * only reporting API. Authenticated by `X-Agency-Api-Key`
 * (`AgencyApiKeyGuard`), NOT the ops bearer key or a session — this is
 * service-to-service, one client's `managed-services` module talking to
 * the Master Platform. Deliberately no `:id`/`:tenantId` path or query
 * parameter anywhere on this controller — "which client" is entirely the
 * presented key, so a leaked key can only ever read its own tenant's data
 * (doc 14's own acceptance criterion, proven by
 * `agency-api-key.guard.spec.ts` / `agency-reporting.controller.spec.ts`).
 */
@Controller('agency/clients/me')
@UseGuards(AgencyKeyThrottlerGuard, AgencyApiKeyGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class AgencyReportingController {
  constructor(private readonly reporting: AgencyReportingService) {}

  @Get('usage')
  usage(@CurrentAgencyClient() client: PlatformTenant) {
    return this.reporting.usage(client.id);
  }

  @Get('invoices')
  invoices(@CurrentAgencyClient() client: PlatformTenant) {
    return this.reporting.invoices(client.id);
  }
}

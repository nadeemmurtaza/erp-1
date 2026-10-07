import { Module } from '@nestjs/common';
import { ManagedServicesController } from './managed-services.controller';
import { ManagedServicesService } from './managed-services.service';

/**
 * doc 14 (commercial-licensing-agency/14-managed-services-module.md) — the
 * client-side "managed-services" module. Extracted only for an
 * agency-managed delivery (`--modules` includes it); deleted outright for
 * a self-hosted one (`scripts/sync-client.mjs`). There is no `agency`
 * module here and never will be — that name belongs exclusively to the
 * Master-Platform-side module in `apps/platform`, which holds every
 * client's data and is never extracted into any client's repo.
 */
@Module({
  controllers: [ManagedServicesController],
  providers: [ManagedServicesService],
})
export class ManagedServicesModule {}

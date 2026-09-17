import { Module } from '@nestjs/common';
import { NodesService } from './nodes.service';

/**
 * `Organization`, `RetailBrand`, `BrandPolicy`, `AdminScope` and the `Node`
 * registry (RETAIL-ERP.md Part 5, WO-18.3). Off by default — see
 * modules.registry.ts — so every deployment today runs exactly as it did
 * before this module existed (R14: "every tier concept must be invisible
 * in Solo"). No controllers yet: WO-18.4 adds the scope guard that reads
 * AdminScope, WO-18.5 the dashboards that read NodesService.
 */
@Module({
  providers: [NodesService],
  exports: [NodesService],
})
export class OrganizationModule {}

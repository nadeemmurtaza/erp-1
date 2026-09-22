import { Module } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';

/**
 * `Organization`, `RetailBrand`, `BrandPolicy`, `AdminScope` and the `Node`
 * registry (RETAIL-ERP.md Part 5, WO-18.3). Off by default — see
 * modules.registry.ts — so every deployment today runs exactly as it did
 * before this module existed (R14: "every tier concept must be invisible
 * in Solo"). `OrganizationController` (WO-18.5) is the shell's read side;
 * `OrganizationService` also writes AdminScope grants and policy switches
 * (org-wide and per-brand, WO-23.3b) and registers itself against
 * BranchPolicyRegistry so `purchasing` can reach the latter without
 * importing this module.
 */
@Module({
  controllers: [OrganizationController],
  providers: [NodesService, OrganizationService],
  exports: [NodesService, OrganizationService],
})
export class OrganizationModule {}

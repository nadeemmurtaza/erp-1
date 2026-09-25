import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OpsAuthGuard } from '../../core/security/ops-auth.guard';
import { RequireOpsPermission } from '../../core/security/decorators';
import { TenantExportService } from './tenant-export.service';
import { TenantRetentionService } from './tenant-retention.service';

@Controller('tenant-exports')
@UseGuards(OpsAuthGuard)
export class TenantExportController {
  constructor(
    private readonly exports: TenantExportService,
    private readonly retention: TenantRetentionService,
  ) {}

  /** WO-39.7's own "self-serve" request, issued today on a tenant's
   *  behalf by an ops principal — see TenantExportService's own doc
   *  comment on why this control plane has no tenant-login principal yet. */
  @Post('tenant/:tenantId')
  @RequireOpsPermission('platform.tenants.manage')
  request(@Param('tenantId') tenantId: string) {
    return this.exports.requestExport(tenantId, 'MANUAL');
  }

  @Get('tenant/:tenantId')
  @RequireOpsPermission('platform.tenants.manage')
  listForTenant(@Param('tenantId') tenantId: string) {
    return this.exports.listForTenant(tenantId);
  }

  @Get(':id')
  @RequireOpsPermission('platform.tenants.manage')
  getById(@Param('id') id: string) {
    return this.exports.getById(id);
  }

  /** The failure path's own listable surface — every tenant past its
   *  retention window with no completed export, so it is never a silent
   *  skip inside a cron log nobody reads. */
  @Get('retention/overdue-without-export')
  @RequireOpsPermission('platform.tenants.manage')
  overdueWithoutExport() {
    return this.retention.listOverdueWithoutExport();
  }
}

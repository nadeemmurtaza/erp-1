import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OpsAuthGuard } from '../../core/security/ops-auth.guard';
import { RequireOpsPermission } from '../../core/security/decorators';
import { ResourceQuotasService } from './resource-quotas.service';
import { UpsertQuotaDto } from './dto/upsert-quota.dto';

@Controller('resource-quotas')
@UseGuards(OpsAuthGuard)
export class ResourceQuotasController {
  constructor(private readonly quotas: ResourceQuotasService) {}

  @Get()
  @RequireOpsPermission('platform.tenants.manage')
  list() {
    return this.quotas.listQuotas();
  }

  @Post()
  @RequireOpsPermission('platform.tenants.manage')
  upsert(@Body() dto: UpsertQuotaDto) {
    return this.quotas.upsertQuota(dto);
  }

  @Get('alerts/tenant/:tenantId')
  @RequireOpsPermission('platform.tenants.manage')
  alertsForTenant(@Param('tenantId') tenantId: string) {
    return this.quotas.listAlertsForTenant(tenantId);
  }
}

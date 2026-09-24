import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OpsAuthGuard } from '../../core/security/ops-auth.guard';
import { RequireOpsPermission } from '../../core/security/decorators';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { SuspendTenantDto } from './dto/suspend-tenant.dto';
import { TenantsService } from './tenants.service';
import { ProvisioningService } from './provisioning.service';

@Controller('tenants')
@UseGuards(OpsAuthGuard)
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly provisioning: ProvisioningService,
  ) {}

  @Get()
  @RequireOpsPermission('platform.tenants.manage')
  list() {
    return this.tenants.list();
  }

  @Get(':id')
  @RequireOpsPermission('platform.tenants.manage')
  async getById(@Param('id') id: string) {
    return this.tenants.getById(id);
  }

  @Post()
  @RequireOpsPermission('platform.tenants.provision')
  provision(@Body() dto: ProvisionTenantDto) {
    return this.provisioning.provisionTenant(dto);
  }

  @Patch(':id/suspend')
  @RequireOpsPermission('platform.tenants.manage')
  async suspend(@Param('id') id: string, @Body() dto: SuspendTenantDto) {
    await this.tenants.getById(id);
    return this.tenants.suspend(id, dto.reason);
  }

  @Patch(':id/reactivate')
  @RequireOpsPermission('platform.tenants.manage')
  async reactivate(@Param('id') id: string) {
    await this.tenants.getById(id);
    return this.tenants.reactivate(id);
  }

  @Patch(':id/deprovision')
  @RequireOpsPermission('platform.tenants.manage')
  async deprovision(@Param('id') id: string) {
    await this.tenants.getById(id);
    return this.provisioning.deprovisionTenant(id);
  }
}

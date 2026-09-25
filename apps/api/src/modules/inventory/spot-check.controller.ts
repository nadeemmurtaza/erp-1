import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SpotCheckService, CreateSpotCheckPolicyInput } from './spot-check.service';
// JwtAuthGuard is registered globally (see core/auth/decorators.ts), so a
// controller only names the capability it needs.
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';

@ApiTags('admin/inventory/spot-check-policies')
@Controller('admin/inventory/spot-check-policies')
export class SpotCheckPolicyController {
  constructor(private readonly service: SpotCheckService) {}

  @Get()
  @RequirePermission('inventory.spot_checks.manage')
  async list() {
    return { data: await this.service.listPolicies() };
  }

  @Post()
  @RequirePermission('inventory.spot_checks.manage')
  async create(@Body() dto: CreateSpotCheckPolicyInput) {
    return this.service.createPolicy(dto);
  }

  @Patch(':id')
  @RequirePermission('inventory.spot_checks.manage')
  async update(@Param('id') id: string, @Body() dto: Partial<CreateSpotCheckPolicyInput> & { isActive?: boolean }) {
    return this.service.updatePolicy(id, dto);
  }
}

/** Counting itself is a front-line task — gated the same as a stock count. */
@ApiTags('admin/inventory/spot-checks')
@Controller('admin/inventory/spot-checks')
export class SpotCheckController {
  constructor(private readonly service: SpotCheckService) {}

  @Get()
  @RequirePermission('inventory.count')
  async findAll() {
    return { data: await this.service.findAll() };
  }

  @Get(':id')
  @RequirePermission('inventory.count')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/start')
  @RequirePermission('inventory.count')
  async start(@Param('id') id: string) {
    return this.service.start(id);
  }

  @Post(':id/scan')
  @RequirePermission('inventory.count')
  async scan(@Param('id') id: string, @Body('barcode') barcode: string) {
    return this.service.scan(id, barcode);
  }

  @Post(':id/complete')
  @RequirePermission('inventory.count')
  async complete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.complete(id, userId);
  }
}

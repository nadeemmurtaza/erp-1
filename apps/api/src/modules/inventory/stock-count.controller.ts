import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StockCountService } from './stock-count.service';
// JwtAuthGuard is registered globally (see core/auth/decorators.ts), so a
// controller only names the capability it needs.
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';

@ApiTags('admin/inventory/counts')
@Controller('admin/inventory/counts')
export class StockCountController {
  constructor(private readonly service: StockCountService) {}

  @Get()
  @RequirePermission('inventory.count')
  async findAll() {
    return this.service.findAll();
  }

  @Post()
  @RequirePermission('inventory.count')
  async create(
    @Body() dto: { note?: string; assignedTo?: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(dto, userId);
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

  @Post(':id/lines/:variantId')
  @RequirePermission('inventory.count')
  async updateLine(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body('counted') counted: number | null,
  ) {
    return this.service.updateLine(id, variantId, counted);
  }

  @Post(':id/complete')
  @RequirePermission('inventory.count')
  async complete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.complete(id, userId);
  }
}

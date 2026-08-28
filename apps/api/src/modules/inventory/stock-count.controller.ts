import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { StockCountService } from './stock-count.service';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { RequirePermission } from '../../core/auth/permissions.decorator';
import { CurrentUser } from '../../core/auth/current-user.decorator';

@Controller('admin/inventory/counts')
@UseGuards(JwtAuthGuard)
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
    @CurrentUser('userId') userId: string,
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
  async complete(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.service.complete(id, userId);
  }
}

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, Roles } from '../../core/auth/decorators';
import { AdjustStockDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('admin/inventory')
@Controller('admin/inventory')
@Roles('ADMIN', 'STAFF')
export class InventoryAdminController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @ApiOperation({ summary: 'Every active variant, with its stock and threshold' })
  list(@Query('lowStockOnly') lowStockOnly?: string, @Query('search') search?: string) {
    return this.inventory.list({ lowStockOnly: lowStockOnly === 'true', search });
  }

  @Post(':variantId/adjust')
  @ApiOperation({ summary: 'Move stock up or down, with a reason on record' })
  adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variantId') variantId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventory.adjust(user.id, variantId, dto);
  }

  @Get(':variantId/history')
  @ApiOperation({ summary: 'Every adjustment made to a variant, newest first' })
  history(@Param('variantId') variantId: string) {
    return this.inventory.history(variantId);
  }
}

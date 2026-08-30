import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { AdjustStockDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('admin/inventory')
@Controller('admin/inventory')
@RequirePermission('inventory.manage')
export class InventoryAdminController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @ApiOperation({ summary: 'Every active variant, with its stock and threshold' })
  list(@Query('lowStockOnly') lowStockOnly?: string, @Query('search') search?: string) {
    return this.inventory.list({ lowStockOnly: lowStockOnly === 'true', search });
  }

  @Post(':variantId/adjust')
  @ApiOperation({ summary: 'Move stock up or down, with a reason on record' })
  async adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variantId') variantId: string,
    @Body() dto: AdjustStockDto,
  ) {
    const reasonMap: Record<string, any> = {
      damaged: 'DAMAGE',
    };
    const reason = reasonMap[dto.reason] || 'ADJUSTMENT';
    const note = dto.reason === 'damaged' ? dto.note : (dto.note ? `legacy reason: ${dto.reason} - ${dto.note}` : `legacy reason: ${dto.reason}`);

    return this.inventory.move({
      variantId,
      delta: dto.delta,
      reason,
      note,
      actorId: user.id,
    });
  }

  @Get(':variantId/history')
  @ApiOperation({ summary: 'Every adjustment made to a variant, newest first' })
  history(@Param('variantId') variantId: string) {
    return this.inventory.history(variantId);
  }
}

import type { StockMovementReason } from '../../core/prisma/client';
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
  list(@Query('filter') filter?: string, @Query('search') search?: string) {
    return this.inventory.list({ filter, search });
  }

  @Get('reorder')
  @ApiOperation({ summary: 'Reorder suggestions based on reorderPoint' })
  reorder() {
    return this.inventory.getReorderSuggestions();
  }

  @Get('slow-movers')
  @ApiOperation({ summary: 'Variants with zero sales in the slow mover window' })
  slowMovers() {
    return this.inventory.getSlowMovers();
  }

  @Post(':variantId/adjust')
  @ApiOperation({ summary: 'Move stock up or down, with a reason on record' })
  async adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variantId') variantId: string,
    @Body() dto: AdjustStockDto,
  ) {
    const reasonMap: Record<string, StockMovementReason> = {
      damaged: 'DAMAGE',
    };
    const reason = reasonMap[dto.reason] || 'ADJUSTMENT';
    const note = dto.reason === 'damaged' ? dto.note : (dto.note ? `legacy reason: ${dto.reason} - ${dto.note}` : `legacy reason: ${dto.reason}`);
    const locationId = await this.inventory.defaultLocationId();

    return this.inventory.move({
      variantId,
      locationId,
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

  @Get(':variantId/chain')
  @RequirePermission('production.view_chain')
  @ApiOperation({ summary: "A SKU's full supply-chain status: stock, open POs, open work orders, pending order lines" })
  chain(@Param('variantId') variantId: string) {
    return this.inventory.getChainStatus(variantId);
  }
}

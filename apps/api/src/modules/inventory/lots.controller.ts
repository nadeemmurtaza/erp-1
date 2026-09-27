import { Controller, Get, Param, Post, Body, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../core/auth/decorators';
import { LotsService } from './lots.service';
import { PreviewAllocationDto } from './dto/lots.dto';

/**
 * 32-lots-batch-expiry-fefo.md WO-32.4/32.6. `inventory.lots.manage` for
 * the ordinary lot list; `inventory.recall` is deliberately narrower — it
 * exposes which orders/customers drew from a batch, the document's own
 * "Whose rows, and which columns" answer.
 */
@ApiTags('admin/inventory/lots')
@Controller('admin/inventory/lots')
export class LotsController {
  constructor(private readonly lots: LotsService) {}

  @Get()
  @RequirePermission('inventory.lots.manage')
  @ApiOperation({ summary: 'Every lot registered for a variant, with its remaining stock per location' })
  list(@Query('variantId') variantId: string) {
    return this.lots.listForVariant(variantId);
  }

  @Get('expiring')
  @RequirePermission('inventory.lots.manage')
  @ApiOperation({ summary: 'Lots nearing expiry with unsold stock — the same candidates InventoryCron alerts on' })
  expiring(@Query('withinDays') withinDays?: string) {
    return this.lots.expiringLotsWithStock(withinDays ? Number(withinDays) : 30);
  }

  @Post('preview-allocation')
  @RequirePermission('inventory.lots.manage')
  @ApiOperation({ summary: 'Dry run: which lots a deduction of this size would draw from, FEFO order' })
  previewAllocation(@Body() dto: PreviewAllocationDto) {
    return this.lots.previewAllocation(dto.variantId, dto.locationId, dto.quantity, dto.preferredLotId);
  }

  @Get(':id')
  @RequirePermission('inventory.lots.manage')
  @ApiOperation({ summary: "One lot's own identity and remaining stock per location" })
  getOne(@Param('id') id: string) {
    return this.lots.getDetail(id);
  }

  @Get(':id/recall')
  @RequirePermission('inventory.recall')
  @ApiOperation({ summary: 'Every order that drew from this lot — the recall query this ledger exists to answer' })
  recall(@Param('id') id: string) {
    return this.lots.recallLookup(id);
  }
}

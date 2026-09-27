import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../core/auth/decorators';
import { PosParkedSalesService } from './pos-parked-sales.service';
import { ParkSaleDto } from './dto/pos-parked-sale.dto';

/**
 * pos-hardware/31 WO-31.3 — park/retrieve for `TAB`/`TABLE` sales, split
 * from `PosSalesController` (which only ever rings up a tendered sale) so
 * neither controller grows past one clear job. Gated by the same
 * `pos.operate` every other till action already uses — parking a sale only
 * changes which button the cashier sees, not what the sale posts (doc 31's
 * own "Authority and blast radius" lens), so it needs no new permission.
 */
@ApiTags('admin/pos/shifts')
@Controller('admin/pos/shifts')
@RequirePermission('pos.operate')
export class PosParkedSalesController {
  constructor(private readonly parked: PosParkedSalesService) {}

  @Post(':id/parked-sales')
  @ApiOperation({ summary: 'Park a TAB/TABLE sale in progress — a COUNTER sale is refused' })
  async park(@Param('id') shiftId: string, @Body() dto: ParkSaleDto) {
    return this.parked.park(shiftId, dto.orderType, dto.label, dto.basketSnapshot);
  }

  @Post(':id/parked-sales/:parkedSaleId/retrieve')
  @ApiOperation({ summary: 'Retrieve a parked sale — refused if it was already retrieved' })
  async retrieve(@Param('parkedSaleId') parkedSaleId: string) {
    return this.parked.retrieve(parkedSaleId);
  }

  @Get(':id/parked-sales')
  @ApiOperation({ summary: 'List this shift\'s still-open parked sales (tabs/tables)' })
  async listOpen(@Param('id') shiftId: string) {
    return this.parked.listOpen(shiftId);
  }
}

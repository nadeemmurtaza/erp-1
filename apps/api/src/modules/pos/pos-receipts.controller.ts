import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../core/auth/decorators';
import { PosReceiptsService } from './pos-receipts.service';

@ApiTags('admin/pos/receipts')
@Controller('admin/pos/receipts')
@RequirePermission('pos.operate')
export class PosReceiptsController {
  constructor(private readonly receipts: PosReceiptsService) {}

  @Get(':orderId')
  @ApiOperation({ summary: 'The receipt for a POS sale, for on-screen preview or a reprint' })
  get(@Param('orderId') orderId: string) {
    return this.receipts.getForOrder(orderId);
  }

  @Post(':orderId/print')
  @ApiOperation({ summary: 'Marks the receipt printed and returns its data — call right before window.print()' })
  print(@Param('orderId') orderId: string) {
    return this.receipts.markPrinted(orderId);
  }
}

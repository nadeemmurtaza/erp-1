import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { PosSalesService } from './pos-sales.service';
import { CreatePosSaleDto } from './dto/pos-sale.dto';

@ApiTags('admin/pos/shifts')
@Controller('admin/pos/shifts')
@RequirePermission('pos.operate')
export class PosSalesController {
  constructor(private readonly sales: PosSalesService) {}

  @Post(':id/sales')
  @ApiOperation({ summary: 'Ring up a sale against an open shift — posts stock and a paid cash Order' })
  async sell(@Param('id') shiftId: string, @Body() dto: CreatePosSaleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sales.sell(shiftId, user.id, dto.lines, {
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerEmail: dto.customerEmail,
    });
  }
}

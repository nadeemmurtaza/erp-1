import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import { IdempotentWrite } from '../../../core/idempotency/idempotent-write.decorator';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { SloRecorderService } from '../../../core/slo/slo-recorder.service';
import { SLO_PATHS } from '../../../core/slo/slo-paths';
import { PosSalesService } from './pos-sales.service';
import { CreatePosSaleDto } from './dto/pos-sale.dto';

@ApiTags('admin/pos/shifts')
@Controller('admin/pos/shifts')
@RequirePermission('pos.operate')
export class PosSalesController {
  constructor(
    private readonly sales: PosSalesService,
    private readonly slo: SloRecorderService,
  ) {}

  @Post(':id/sales')
  @IdempotentWrite('pos.sale.create')
  @ApiOperation({ summary: 'Ring up a sale against an open shift — posts stock and a paid cash Order' })
  async sell(@Param('id') shiftId: string, @Body() dto: CreatePosSaleDto, @CurrentUser() user: AuthenticatedUser) {
    // 38-resilience-engineering.md §3, WO-38.3 — POS sale completion's own
    // SLO path, same non-blocking recording discipline as checkout's.
    return this.slo.time(SLO_PATHS.PosSale, () =>
      this.sales.sell(
        shiftId,
        user.id,
        dto.lines,
        {
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          customerEmail: dto.customerEmail,
        },
        dto.instalmentPlan,
      ),
    );
  }
}

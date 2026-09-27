import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { IdempotentWrite } from '../../core/idempotency/idempotent-write.decorator';
import { InstalmentPlanService } from './instalment-plan.service';
import { RecordInstalmentPaymentDto } from './dto/instalment-plan.dto';

/**
 * finance-accounting/151-layby-installment-sales.md — a plan is created at
 * the point of sale (POS's own sell() endpoint); everything after that
 * lives here. Recording a routine payment sits behind the same
 * `pos.operate` any till shift already requires; cancelling or writing off
 * a plan is a real policy decision, gated separately and more sensitively.
 */
@ApiTags('admin/orders/instalments')
@Controller('admin/orders/:orderId/instalments')
export class InstalmentPlanController {
  constructor(private readonly plans: InstalmentPlanService) {}

  @Get()
  @RequirePermission('pos.operate')
  @ApiOperation({ summary: "An order's instalment plan, its schedule, and every payment received so far" })
  async get(@Param('orderId') orderId: string) {
    return this.plans.getPlan(orderId);
  }

  @Post('payments')
  @RequirePermission('pos.operate')
  @IdempotentWrite('instalment.payment.record')
  @ApiOperation({ summary: 'Record one instalment payment against the plan' })
  async recordPayment(
    @Param('orderId') orderId: string,
    @Body() dto: RecordInstalmentPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.recordInstalmentPayment(user.id, orderId, dto.amountMinor, dto.provider);
  }

  @Post('cancel')
  @RequirePermission('pos.instalments.cancel')
  @ApiOperation({ summary: 'Cancel an active plan — refunds or forfeits the deposit per the configured policy' })
  async cancel(@Param('orderId') orderId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.plans.cancel(user.id, orderId);
  }

  @Post('default')
  @RequirePermission('pos.instalments.default')
  @ApiOperation({ summary: 'Mark an active plan defaulted — writes off the unpaid balance' })
  async markDefaulted(@Param('orderId') orderId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.plans.markDefaulted(user.id, orderId);
  }
}

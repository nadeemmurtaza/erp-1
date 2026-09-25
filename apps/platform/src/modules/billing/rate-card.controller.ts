import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OpsAuthGuard } from '../../core/security/ops-auth.guard';
import { CurrentOpsClient, RequireOpsPermission } from '../../core/security/decorators';
import { RateCardService } from './rate-card.service';
import { ProposeRateCardChangeDto, RejectRateCardChangeDto } from './dto/rate-card.dto';
import type { PlatformOpsClient } from '../../core/prisma/client';

@Controller('rate-card-changes')
@UseGuards(OpsAuthGuard)
export class RateCardController {
  constructor(private readonly rateCards: RateCardService) {}

  @Post('plan/:planId')
  @RequireOpsPermission('platform.billing.manage')
  propose(
    @Param('planId') planId: string,
    @Body() dto: ProposeRateCardChangeDto,
    @CurrentOpsClient() opsClient: PlatformOpsClient,
  ) {
    return this.rateCards.proposeChange({ planId, ...dto, requestedByOpsClientId: opsClient.id });
  }

  @Get('pending')
  @RequireOpsPermission('platform.billing.manage')
  listPending() {
    return this.rateCards.listPending();
  }

  @Get('plan/:planId')
  @RequireOpsPermission('platform.billing.manage')
  listForPlan(@Param('planId') planId: string) {
    return this.rateCards.listForPlan(planId);
  }

  @Patch(':id/approve')
  @RequireOpsPermission('platform.billing.approve')
  approve(@Param('id') id: string, @CurrentOpsClient() opsClient: PlatformOpsClient) {
    return this.rateCards.approve(id, opsClient.id);
  }

  @Patch(':id/reject')
  @RequireOpsPermission('platform.billing.approve')
  reject(@Param('id') id: string, @Body() dto: RejectRateCardChangeDto) {
    return this.rateCards.reject(id, dto.reason);
  }

  @Patch(':id/apply')
  @RequireOpsPermission('platform.billing.approve')
  apply(@Param('id') id: string) {
    return this.rateCards.apply(id);
  }
}

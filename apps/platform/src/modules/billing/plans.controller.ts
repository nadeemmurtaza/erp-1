import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OpsAuthGuard } from '../../core/security/ops-auth.guard';
import { RequireOpsPermission } from '../../core/security/decorators';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Controller('plans')
@UseGuards(OpsAuthGuard)
@RequireOpsPermission('platform.billing.manage')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list() {
    return this.plans.list();
  }

  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.plans.create(dto);
  }

  /** WO-154.1/154.3 — flip `isHeadline`/`headlineOrder` and set the
   *  pricing-page copy on an existing plan; see `PlansService.update()`. */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(id, dto);
  }
}

import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { OpsAuthGuard } from '../../core/security/ops-auth.guard';
import { CurrentOpsClient, RequireOpsPermission } from '../../core/security/decorators';
import { TrialsService } from './trials.service';
import { ExtendTrialDto } from './dto/extend-trial.dto';
import type { PlatformOpsClient } from '../../core/prisma/client';

@Controller('trials')
@UseGuards(OpsAuthGuard)
export class TrialsController {
  constructor(private readonly trials: TrialsService) {}

  @Get()
  @RequireOpsPermission('platform.trials.extend', 'platform.tenants.manage')
  list() {
    return this.trials.listTrials();
  }

  @Get('extended-more-than-once')
  @RequireOpsPermission('platform.trials.extend', 'platform.tenants.manage')
  extendedMoreThanOnce() {
    return this.trials.listExtendedMoreThanOnce();
  }

  @Get(':tenantId/extensions')
  @RequireOpsPermission('platform.trials.extend', 'platform.tenants.manage')
  extensions(@Param('tenantId') tenantId: string) {
    return this.trials.listExtensions(tenantId);
  }

  @Patch(':tenantId/extend')
  @RequireOpsPermission('platform.trials.extend')
  extend(@Param('tenantId') tenantId: string, @Body() dto: ExtendTrialDto, @CurrentOpsClient() opsClient: PlatformOpsClient) {
    return this.trials.extend(tenantId, new Date(dto.newExpiresAt), dto.reason, opsClient.id);
  }

  @Patch(':tenantId/convert')
  @RequireOpsPermission('platform.tenants.manage')
  convert(@Param('tenantId') tenantId: string) {
    return this.trials.convert(tenantId);
  }
}

import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { FeatureFlagsAdminService } from './feature-flags-admin.service';
import { CreateFeatureFlagDto, ProposeRolloutDto, UpdateFeatureFlagDto } from './dto/feature-flag.dto';

/**
 * resilience-scalability/37-scalability-future-upgrades.md (WO-37.2/37.5).
 * Every route sits behind `platform.flags.manage`, except approving a
 * proposed rollout change, which is gated separately by
 * `platform.flags.approve_rollout` and checked again inside
 * `FeatureFlagsAdminService.approveRollout()` itself — never trusted from
 * the route decorator alone, the identical shape
 * `SettlementsController`/`SettlementsService` already establish.
 */
@ApiTags('admin/feature-flags')
@Controller('admin/feature-flags')
@RequirePermission('platform.flags.manage')
export class FeatureFlagsAdminController {
  constructor(private readonly featureFlags: FeatureFlagsAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Every feature flag' })
  async list() {
    return { data: await this.featureFlags.list() };
  }

  @Get('audit')
  @ApiOperation({ summary: 'WO-37.3 — every flag older than 90 days with no stated removal criteria' })
  async audit() {
    return { data: await this.featureFlags.listStale() };
  }

  @Get(':id')
  @ApiOperation({ summary: "One flag's detail" })
  async get(@Param('id') id: string) {
    return this.featureFlags.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a feature flag' })
  async create(@Body() dto: CreateFeatureFlagDto, @CurrentUser() user: AuthenticatedUser) {
    return this.featureFlags.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a flag — killSwitch=true and any non-100% rollout apply immediately; the risky direction on a money/stock-path flag is refused here' })
  async update(@Param('id') id: string, @Body() dto: UpdateFeatureFlagDto, @CurrentUser() user: AuthenticatedUser) {
    return this.featureFlags.update(id, dto, user.id);
  }

  @Post(':id/propose-rollout')
  @ApiOperation({ summary: 'Propose 100% rollout and/or clearing the kill switch on a money/stock-path flag — the maker half of the pair' })
  async proposeRollout(@Param('id') id: string, @Body() dto: ProposeRolloutDto, @CurrentUser() user: AuthenticatedUser) {
    return this.featureFlags.proposeRollout(id, dto, user.id);
  }

  @Post(':id/approve-rollout')
  @RequirePermission('platform.flags.approve_rollout')
  @ApiOperation({ summary: 'Approve a proposed rollout change — the checker half, never the same person as the proposal' })
  async approveRollout(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.featureFlags.approveRollout(id, user.id);
  }
}

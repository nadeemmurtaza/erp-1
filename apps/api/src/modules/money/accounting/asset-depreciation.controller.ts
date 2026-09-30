import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import { AssetDepreciationService } from './asset-depreciation.service';
import { CreateDepreciationScheduleDto, DisposeAssetDto } from './dto/asset-depreciation.dto';

/**
 * 147-fixed-asset-depreciation.md — reads sit behind `finance.assets.
 * depreciate` like the write that creates a schedule; disposal is gated
 * separately by `finance.assets.dispose` since it posts a real loss/gain.
 */
@ApiTags('admin/accounting/asset-depreciation')
@Controller('admin/accounting/assets')
export class AssetDepreciationController {
  constructor(private readonly depreciation: AssetDepreciationService) {}

  @Get(':assetId/depreciation-schedule')
  @RequirePermission('finance.assets.depreciate')
  @ApiOperation({ summary: "An asset's depreciation schedule and every period posted so far" })
  async getSchedule(@Param('assetId') assetId: string) {
    const schedule = await this.depreciation.getSchedule(assetId);
    if (!schedule) throw new NotFoundException('This asset has no depreciation schedule.');
    return schedule;
  }

  @Post(':assetId/depreciation-schedule')
  @RequirePermission('finance.assets.depreciate')
  @ApiOperation({ summary: 'Put an asset on a monthly depreciation schedule' })
  async createSchedule(
    @Param('assetId') assetId: string,
    @Body() dto: CreateDepreciationScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.depreciation.createSchedule(assetId, dto, user.id);
  }

  @Post(':assetId/dispose')
  @RequirePermission('finance.assets.dispose')
  @ApiOperation({ summary: 'Dispose an asset — posts the remaining book value as a loss and any sale proceeds as a gain' })
  async dispose(@Param('assetId') assetId: string, @Body() dto: DisposeAssetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.depreciation.disposeAsset(
      assetId,
      dto.disposalDate ? new Date(dto.disposalDate) : new Date(),
      dto.saleProceedsMinor ?? 0,
      user.id,
    );
  }
}

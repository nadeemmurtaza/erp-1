import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import type { AssetStatus } from '../../core/prisma/client';
import { AssetsService } from './assets.service';
import { CreateAssetDto, IssueAssetDto, ReturnAssetDto, WriteOffAssetDto } from './dto/asset.dto';

/**
 * Employee equipment custody (hr-people-org/79-employee-asset-management.md
 * WO-79.2). Day-to-day issue/return/create sits behind `hr.assets.manage`;
 * writing an asset off as `RETIRED`/`LOST` additionally requires
 * `hr.assets.writeoff` — a real cost, gated separately from routine custody.
 */
@ApiTags('admin/hr/assets')
@Controller('admin/hr/assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @RequirePermission('hr.assets.manage')
  @ApiOperation({ summary: 'List assets, optionally filtered by status' })
  async list(@Query('status') status?: AssetStatus) {
    return { data: await this.assets.listAssets(status) };
  }

  @Get(':id')
  @RequirePermission('hr.assets.manage')
  @ApiOperation({ summary: "One asset's detail and full assignment history" })
  async get(@Param('id') id: string) {
    return this.assets.getAsset(id);
  }

  @Post()
  @RequirePermission('hr.assets.manage')
  @ApiOperation({ summary: 'Register a new asset' })
  async create(@Body() dto: CreateAssetDto) {
    return this.assets.createAsset(dto);
  }

  @Post(':id/issue')
  @RequirePermission('hr.assets.manage')
  @ApiOperation({ summary: 'Issue an AVAILABLE asset to an employee' })
  async issue(@Param('id') id: string, @Body() dto: IssueAssetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.assets.issue(id, dto.userId, user.id);
  }

  @Post('assignments/:assignmentId/return')
  @RequirePermission('hr.assets.manage')
  @ApiOperation({ summary: 'Return an issued asset' })
  async returnAsset(
    @Param('assignmentId') assignmentId: string,
    @Body() dto: ReturnAssetDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assets.returnAsset(assignmentId, user.id, dto.condition);
  }

  @Post(':id/write-off')
  @RequirePermission('hr.assets.writeoff')
  @ApiOperation({ summary: 'Mark an asset RETIRED or LOST' })
  async writeOff(@Param('id') id: string, @Body() dto: WriteOffAssetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.assets.writeOff(id, dto.status, user.id);
  }

  @Get('employees/:userId/unreturned')
  @RequirePermission('hr.assets.manage')
  @ApiOperation({ summary: "An employee's unreturned assets — the offboarding gate's own check" })
  async unreturnedFor(@Param('userId') userId: string) {
    return { data: await this.assets.unreturnedAssetsFor(userId) };
  }
}

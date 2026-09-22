import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { VIEW_COST } from '../../core/common/cost-fields';
import { CreateRawMaterialDto, RawMaterialQueryDto, UpdateRawMaterialDto } from './dto/raw-material.dto';
import { RawMaterialService } from './raw-material.service';

/** Deletes costPrice from a raw-material payload for a caller without VIEW_COST — same default-safe shape as stripProductCost, just for RawMaterialService's flat response instead of a Product-with-variants one. */
function stripCost<T extends { costPrice?: unknown }>(row: T, user: AuthenticatedUser): T {
  if (!user.permissions.includes(VIEW_COST)) delete row.costPrice;
  return row;
}

/** Same, plus the per-movement unitCost the detail view includes. */
function stripDetailCost<T extends { costPrice?: unknown; recentMovements: Array<{ unitCost?: unknown }> }>(
  row: T,
  user: AuthenticatedUser,
): T {
  stripCost(row, user);
  if (!user.permissions.includes(VIEW_COST)) {
    for (const movement of row.recentMovements) delete movement.unitCost;
  }
  return row;
}

@ApiTags('BOM Admin')
@Controller('admin/bom')
export class BomController {
  constructor(private readonly rawMaterials: RawMaterialService) {}

  @Get('raw-materials')
  @RequirePermission('bom.view')
  @ApiOperation({ summary: 'List raw materials, paginated and filtered' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: RawMaterialQueryDto) {
    const result = await this.rawMaterials.list(query);
    result.data = result.data.map((row) => stripCost(row, user));
    return result;
  }

  @Get('raw-materials/:id')
  @RequirePermission('bom.view')
  @ApiOperation({ summary: 'Raw material detail plus its recent stock movements' })
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return stripDetailCost(await this.rawMaterials.get(id), user);
  }

  @Post('raw-materials')
  @RequirePermission('bom.manage')
  @ApiOperation({ summary: 'Create a raw material — a Product/ProductVariant pair, filed under the raw-materials category' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRawMaterialDto) {
    return stripCost(await this.rawMaterials.create(dto), user);
  }

  @Patch('raw-materials/:id')
  @RequirePermission('bom.manage')
  @ApiOperation({ summary: 'Edit a raw material' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRawMaterialDto,
  ) {
    return stripCost(await this.rawMaterials.update(id, dto), user);
  }

  @Post('raw-materials/:id/deactivate')
  @RequirePermission('bom.manage')
  @ApiOperation({ summary: 'Deactivate a raw material' })
  async deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return stripCost(await this.rawMaterials.deactivate(id), user);
  }
}

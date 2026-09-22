import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { VIEW_COST } from '../../core/common/cost-fields';
import { CreateRawMaterialDto, RawMaterialQueryDto, UpdateRawMaterialDto } from './dto/raw-material.dto';
import { CreateRecipeDto, RecipeAvailabilityQueryDto, RecipeQueryDto, UpdateRecipeDto } from './dto/recipe.dto';
import { CreateProductionRunDto, ProductionRunQueryDto } from './dto/production-run.dto';
import { RawUsageQueryDto } from './dto/raw-usage.dto';
import { BomMetricsService } from './bom.metrics';
import { ProductionService } from './production.service';
import { RawMaterialService } from './raw-material.service';
import { RecipeService } from './recipe.service';

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

/** Deletes every cost field from a recipe payload for a caller without VIEW_COST — absent, not zeroed. */
function stripRecipeCost<T extends {
  labourCost?: unknown;
  overheadCost?: unknown;
  rolledUpUnitCost?: unknown;
  costComplete?: unknown;
  costComputedAt?: unknown;
}>(row: T, user: AuthenticatedUser): T {
  if (!user.permissions.includes(VIEW_COST)) {
    delete row.labourCost;
    delete row.overheadCost;
    delete row.rolledUpUnitCost;
    delete row.costComplete;
    delete row.costComputedAt;
  }
  return row;
}

@ApiTags('BOM Admin')
@Controller('admin/bom')
export class BomController {
  constructor(
    private readonly rawMaterials: RawMaterialService,
    private readonly recipes: RecipeService,
    private readonly production: ProductionService,
    private readonly metrics: BomMetricsService,
  ) {}

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

  @Get('missing')
  @RequirePermission('bom.view')
  @ApiOperation({ summary: 'Variants with no recipe, and ACTIVE recipes whose cost is still incomplete' })
  async missing() {
    return this.recipes.missingSummary();
  }

  @Get('recipes')
  @RequirePermission('bom.view')
  @ApiOperation({ summary: 'List recipes — filter=all|active|missing|incomplete-cost' })
  async listRecipes(@CurrentUser() user: AuthenticatedUser, @Query() query: RecipeQueryDto) {
    const result = await this.recipes.list(query);
    // filter=missing returns variant rows with no cost field at all — nothing to strip.
    result.data = result.data.map((row) => ('rolledUpUnitCost' in row ? stripRecipeCost(row, user) : row));
    return result;
  }

  @Get('recipes/:id')
  @RequirePermission('bom.view')
  @ApiOperation({ summary: 'Recipe detail with its components' })
  async getRecipe(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return stripRecipeCost(await this.recipes.get(id), user);
  }

  @Post('recipes')
  @RequirePermission('bom.manage')
  @ApiOperation({ summary: 'Create a recipe for a finished ProductVariant' })
  async createRecipe(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRecipeDto) {
    return stripRecipeCost(await this.recipes.create(dto, user.id), user);
  }

  @Patch('recipes/:id')
  @RequirePermission('bom.manage')
  @ApiOperation({ summary: 'Edit a recipe — recomputes the cost rollup in the same transaction' })
  async updateRecipe(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRecipeDto,
  ) {
    return stripRecipeCost(await this.recipes.update(id, dto), user);
  }

  @Post('recipes/:id/activate')
  @RequirePermission('bom.manage')
  @ApiOperation({ summary: 'Activate a recipe — 400 unless it has at least one non-optional component' })
  async activateRecipe(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return stripRecipeCost(await this.recipes.activate(id), user);
  }

  @Post('recipes/:id/archive')
  @RequirePermission('bom.manage')
  @ApiOperation({ summary: 'Archive a recipe' })
  async archiveRecipe(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return stripRecipeCost(await this.recipes.archive(id), user);
  }

  @Get('recipes/:id/cost')
  @RequirePermission('bom.view')
  @ApiOperation({ summary: 'Per-component cost breakdown, recomputed live' })
  async recipeCost(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (!user.permissions.includes(VIEW_COST)) {
      throw new ForbiddenException('You do not have access to cost data.');
    }
    return this.recipes.costBreakdown(id);
  }

  @Get('recipes/:id/availability')
  @RequirePermission('bom.view')
  @ApiOperation({ summary: 'Whether this recipe can be produced now, and how many runs current stock supports' })
  async recipeAvailability(@Param('id') id: string, @Query() query: RecipeAvailabilityQueryDto) {
    return this.recipes.availability(id, query.quantity);
  }

  @Post('recipes/:id/seed-cost-price')
  @RequirePermission('bom.manage')
  @ApiOperation({ summary: 'Backfill costPrice = rolledUpUnitCost for a variant manufactured before BOM existed — only where costPrice is 0 and the cost is complete' })
  async seedCostPrice(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (!user.permissions.includes(VIEW_COST)) {
      throw new ForbiddenException('You do not have access to cost data.');
    }
    return this.recipes.seedCostPrice(id, user.id);
  }

  @Get('production-runs')
  @RequirePermission('bom.view')
  @ApiOperation({ summary: 'List production runs' })
  async listProductionRuns(@Query() query: ProductionRunQueryDto) {
    return this.production.list(query);
  }

  @Get('production-runs/:id')
  @RequirePermission('bom.view')
  @ApiOperation({ summary: 'Production run detail with its consumed-material lines' })
  async getProductionRun(@Param('id') id: string) {
    return this.production.get(id);
  }

  @Post('production-runs')
  @RequirePermission('bom.produce')
  @ApiOperation({ summary: 'Record a production run — consumes raw stock, credits finished stock, rolls the finished cost forward' })
  async createProductionRun(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductionRunDto) {
    return this.production.create(dto, user.id);
  }

  @Delete('production-runs/:id')
  @RequirePermission('bom.manage')
  @ApiOperation({ summary: 'Always 405 — a production run is ledger history, never deleted' })
  deleteProductionRun(): never {
    return this.production.remove();
  }

  @Get('raw-usage')
  @RequirePermission('bom.view')
  @ApiOperation({ summary: 'Raw-material consumption over time, sourced from the stock ledger — cost fields only with inventory.view_cost' })
  async rawUsage(@CurrentUser() user: AuthenticatedUser, @Query() query: RawUsageQueryDto) {
    const result = await this.metrics.rawUsage(query);
    if (!user.permissions.includes(VIEW_COST)) {
      result.totals = result.totals.map((row) => {
        const stripped = { ...row };
        delete stripped.consumedCost;
        return stripped;
      });
    }
    return result;
  }
}

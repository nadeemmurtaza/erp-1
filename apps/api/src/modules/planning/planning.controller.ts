import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { PlanningService } from './planning.service';
import { LiquidityForecastService } from './liquidity-forecast.service';
import { SupplierResilienceService } from './supplier-resilience.service';
import { OnlineStockService } from './online-stock.service';
import type { Shock } from './propagation';
import { AssignFulfillingBranchDto, LiquidityForecastQueryDto, RunPropagationDto } from './dto/planning.dto';

function toShock(dto: RunPropagationDto): Shock {
  switch (dto.kind) {
    case 'SupplierDown':
      return { kind: 'SupplierDown', supplierId: dto.supplierId!, days: dto.days ?? 7 };
    case 'LeadTimeShift':
      return { kind: 'LeadTimeShift', supplierId: dto.supplierId!, deltaDays: dto.deltaDays ?? 0 };
    case 'LocationDown':
      return { kind: 'LocationDown', locationId: dto.locationId!, days: dto.days ?? 1 };
    case 'DemandShock':
      return { kind: 'DemandShock', variantId: dto.variantId!, pctChange: dto.pctChange ?? 0 };
    case 'CashShock':
      return { kind: 'CashShock', amountMinor: dto.amountMinor ?? 0 };
    case 'SkuRecall':
      return { kind: 'SkuRecall', variantId: dto.variantId! };
  }
}

/**
 * 144-supply-chain-resilience-planning-engine.md — every read sits behind
 * `planning.propagation.view`; assigning a fulfilling branch is a real
 * stock write and reuses `inventory.manage`, the same permission any other
 * manual stock correction already requires (this document's own "Authority
 * and blast radius" lens: viewing a risk report and executing a stock
 * transfer are never the same grant).
 */
@ApiTags('admin/planning')
@Controller('admin/planning')
@RequirePermission('planning.propagation.view')
export class PlanningController {
  constructor(
    private readonly planning: PlanningService,
    private readonly liquidity: LiquidityForecastService,
    private readonly resilience: SupplierResilienceService,
    private readonly onlineStock: OnlineStockService,
  ) {}

  @Post('propagate')
  @ApiOperation({ summary: 'Run a shock scenario over the dependency graph and rank recovery actions' })
  async propagate(@Body() dto: RunPropagationDto) {
    return this.planning.runPropagation(toShock(dto), { includeNarration: dto.includeNarration });
  }

  @Get('liquidity-forecast')
  @ApiOperation({ summary: 'Current cash plus the next scheduled AR/AP/payroll events' })
  async liquidityForecast(@Query() query: LiquidityForecastQueryDto) {
    return this.liquidity.forecast(query.horizonDays ?? 30);
  }

  @Get('suppliers/:id/lead-time-distribution')
  @ApiOperation({ summary: "A supplier's own lead-time distribution, backfilled from goods-receipt history" })
  async leadTimeDistribution(@Param('id') id: string) {
    return this.resilience.leadTimeDistribution(id);
  }

  @Get('suppliers/:id/scorecard')
  @ApiOperation({ summary: 'On-time-in-full rate and price variance, computed from purchase-order history' })
  async supplierScorecard(@Param('id') id: string) {
    return this.resilience.supplierScorecard(id);
  }

  @Get('online-stock/:variantId')
  @ApiOperation({ summary: 'Online stock for a variant — the sum of every branch allotment' })
  async onlineStockFor(@Param('variantId') variantId: string) {
    return { onlineStock: await this.onlineStock.onlineStockFor(variantId) };
  }

  @Post('orders/:orderId/assign-branch')
  @RequirePermission('inventory.manage')
  @ApiOperation({ summary: 'Reassign which branch fulfils an order — reverses and re-commits stock through the same writer every sale uses' })
  async assignFulfillingBranch(@Param('orderId') orderId: string, @Body() dto: AssignFulfillingBranchDto, @CurrentUser() user: AuthenticatedUser) {
    await this.onlineStock.assignFulfillingBranch(orderId, dto.locationId, user.id);
    return { reassigned: true };
  }
}

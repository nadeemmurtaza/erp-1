import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../core/auth/decorators';
import { CircuitBreakerService } from '../../core/resilience/circuit-breaker.service';
import { SloRecorderService } from '../../core/slo/slo-recorder.service';
import { SLO_PATHS } from '../../core/slo/slo-paths';
import { ConfigureCircuitDto, SimulateCircuitDto } from './dto/resilience.dto';

/**
 * 38-resilience-engineering.md, WO-38.1/38.2/38.3/38.4. Every route sits
 * behind `platform.resilience.view` — tuning a circuit's threshold or
 * cooldown is gated separately by `platform.resilience.tune` (doc 38's own
 * "Authority and blast radius" scope-lens), checked again on the route
 * itself, the identical shape `FeatureFlagsAdminController` already
 * establishes for its own two-tier permission split.
 */
@ApiTags('admin/resilience')
@Controller('admin/resilience')
@RequirePermission('platform.resilience.view')
export class ResilienceAdminController {
  constructor(
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly sloRecorder: SloRecorderService,
  ) {}

  @Get('circuits')
  @ApiOperation({ summary: 'Every circuit breaker that has taken a call or been configured, with its live state' })
  list() {
    return { data: this.circuitBreaker.listSnapshots() };
  }

  @Post('circuits/:key/configure')
  @RequirePermission('platform.resilience.tune')
  @ApiOperation({ summary: "Change a circuit's failure threshold and/or cooldown window" })
  configure(@Param('key') key: string, @Body() dto: ConfigureCircuitDto) {
    return this.circuitBreaker.configure(key, dto);
  }

  @Post('circuits/:key/simulate')
  @RequirePermission('platform.resilience.tune')
  @ApiOperation({
    summary:
      'Dry run: replays a candidate threshold/cooldown against a call history the caller supplies. Pure — never touches the live circuit named by `key`.',
  })
  simulate(@Body() dto: SimulateCircuitDto) {
    return this.circuitBreaker.simulate(
      dto.history.map((point) => ({ occurredAt: new Date(point.occurredAt), succeeded: point.succeeded })),
      { failureThreshold: dto.failureThreshold, cooldownMs: dto.cooldownMs },
    );
  }

  @Get('slo')
  @ApiOperation({ summary: 'Trailing-30-day success rate, p95 latency and remaining error budget for checkout, POS sale completion and till-parent sync — each carries its own overBudget boolean' })
  async slo() {
    return { data: await this.sloRecorder.computeAllBudgets() };
  }

  @Get('dr')
  @ApiOperation({ summary: 'RPO/RTO as documented in DEPLOYMENT.md §9 — stated facts, not live data' })
  dr() {
    // Mirrors DEPLOYMENT.md's own "RPO/RTO" subsection under §9 — kept as a
    // small, explicit constant here rather than parsed from the doc at
    // runtime, the same "stated fact, not a live query" doc 38 itself asks
    // for these two numbers to be. Update both together.
    return {
      rpo: {
        value: '24 hours',
        basis: "The nightly backup timer's 03:00 UTC schedule (+ up to 5 minutes randomized delay) — see DEPLOYMENT.md §9.",
      },
      rto: {
        value: null,
        status: 'not yet measured',
        reason:
          "The backup script's own restore-test path needs a live Docker Swarm stack running the production images — no such environment exists in development/CI today. First real measurement is the next quarterly game-day (see DEPLOYMENT.md §9).",
      },
      quarterlyGameDay: {
        cadence: 'quarterly',
        owner: 'platform.resilience.oncall holder',
        lastRun: null,
      },
    };
  }

  @Get('slo-paths')
  @ApiOperation({ summary: 'The three named critical paths this dashboard tracks, for the frontend to render without hardcoding them twice' })
  paths() {
    return { data: Object.values(SLO_PATHS) };
  }
}

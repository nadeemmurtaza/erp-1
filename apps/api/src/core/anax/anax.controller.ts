import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/decorators';
import { AnaxService } from './anax.service';
import type {
  BusinessValuationInsight,
  ComprehensiveBusinessIntelligenceReport,
  FourWingFlightCommand,
  GeopoliticalRelationshipInsight,
  WorldMacroSignal,
} from './anax.types';

/** This deployment is one organization (no `organizationId`/tenant column
 * exists on `Order` or any other table `AnaxSensorService` reads) --
 * `tenantId` is a cosmetic label on the report, never a query filter.
 * Accepting it from the caller added nothing but an unvalidated input on
 * routes now reachable by any `analytics.view`-holding API key, so it's
 * fixed to `'default'` here rather than taken from the request. */
const DEFAULT_TENANT_ID = 'default';

@ApiTags('ANAX Dragonfly Predictive Intelligence')
@Controller('anax')
export class AnaxController {
  constructor(private readonly anaxService: AnaxService) {}

  @Get('insights')
  @RequirePermission('analytics.view')
  @ApiOperation({
    summary: 'Comprehensive ANAX Dragonfly Business Intelligence and Trajectory Report',
    description:
      'Fuses 30,000 compound lenses (POS, orders, LiveProof, returns, cash, war risks, currency volatility) into a 16-neuron state vector and 4-wing flight commands.',
  })
  async getComprehensiveInsights(): Promise<ComprehensiveBusinessIntelligenceReport> {
    return this.anaxService.generateComprehensiveReport(DEFAULT_TENANT_ID);
  }

  @Get('flight-plan')
  @RequirePermission('analytics.view')
  @ApiOperation({
    summary: '4-Wing Harmonic Flight Control Matrix',
    description:
      'Returns four independent, non-conflicting actuation vectors: Dynamic Pricing (Wing 1), Preemptive Procurement (Wing 2), Working Capital & FX Hedging (Wing 3), and Fraud/Retention Shield (Wing 4).',
  })
  async getFlightPlan(): Promise<FourWingFlightCommand> {
    const report = await this.anaxService.generateComprehensiveReport(DEFAULT_TENANT_ID);
    return report.flightCommand;
  }

  @Get('geopolitical-risk')
  @RequirePermission('analytics.view')
  @ApiOperation({
    summary: 'Global War Risk, Maritime Chokepoint & Sanctions Analysis',
    description:
      'Evaluates bilateral tensions, maritime sea lanes (Bab-el-Mandeb, Suez, Hormuz, Malacca), and projected shipping inflation.',
  })
  async getGeopoliticalRisk(): Promise<GeopoliticalRelationshipInsight> {
    const report = await this.anaxService.generateComprehensiveReport(DEFAULT_TENANT_ID);
    return report.geopoliticalRisk;
  }

  @Get('valuation')
  @RequirePermission('analytics.view')
  @ApiOperation({
    summary: 'Enterprise Business Valuation & Resilience Rating',
    description:
      'Calculates dynamic enterprise valuation with discounts for unhedged FX volatility and war risk, returning AAA-CCC resilience rating.',
  })
  async getEnterpriseValuation(): Promise<BusinessValuationInsight> {
    const report = await this.anaxService.generateComprehensiveReport(DEFAULT_TENANT_ID);
    return report.valuation;
  }

  @Post('evaluate')
  @RequirePermission('analytics.view')
  @ApiOperation({
    summary: 'Simulate Trajectory Under Custom Macro Shocks',
    description:
      'Allows business leaders to model scenarios (e.g. 20% crude oil price jump, 10% currency devaluation, Red Sea chokepoint closure).',
  })
  async evaluateScenario(
    @Body() scenario: { customWorld?: Partial<WorldMacroSignal> },
  ): Promise<ComprehensiveBusinessIntelligenceReport> {
    return this.anaxService.generateComprehensiveReport(DEFAULT_TENANT_ID, scenario.customWorld);
  }
}

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnaxService } from './anax.service';
import type {
  BusinessValuationInsight,
  ComprehensiveBusinessIntelligenceReport,
  FourWingFlightCommand,
  GeopoliticalRelationshipInsight,
  WorldMacroSignal,
} from './anax.types';

@ApiTags('ANAX Dragonfly Predictive Intelligence')
@Controller('anax')
export class AnaxController {
  constructor(private readonly anaxService: AnaxService) {}

  @Get('insights')
  @ApiOperation({
    summary: 'Comprehensive ANAX Dragonfly Business Intelligence and Trajectory Report',
    description:
      'Fuses 30,000 compound lenses (POS, orders, LiveProof, returns, cash, war risks, currency volatility) into a 16-neuron state vector and 4-wing flight commands.',
  })
  async getComprehensiveInsights(
    @Query('tenantId') tenantId: string = 'default',
  ): Promise<ComprehensiveBusinessIntelligenceReport> {
    return this.anaxService.generateComprehensiveReport(tenantId);
  }

  @Get('flight-plan')
  @ApiOperation({
    summary: '4-Wing Harmonic Flight Control Matrix',
    description:
      'Returns four independent, non-conflicting actuation vectors: Dynamic Pricing (Wing 1), Preemptive Procurement (Wing 2), Working Capital & FX Hedging (Wing 3), and Fraud/Retention Shield (Wing 4).',
  })
  async getFlightPlan(
    @Query('tenantId') tenantId: string = 'default',
  ): Promise<FourWingFlightCommand> {
    const report = await this.anaxService.generateComprehensiveReport(tenantId);
    return report.flightCommand;
  }

  @Get('geopolitical-risk')
  @ApiOperation({
    summary: 'Global War Risk, Maritime Chokepoint & Sanctions Analysis',
    description:
      'Evaluates bilateral tensions, maritime sea lanes (Bab-el-Mandeb, Suez, Hormuz, Malacca), and projected shipping inflation.',
  })
  async getGeopoliticalRisk(
    @Query('tenantId') tenantId: string = 'default',
  ): Promise<GeopoliticalRelationshipInsight> {
    const report = await this.anaxService.generateComprehensiveReport(tenantId);
    return report.geopoliticalRisk;
  }

  @Get('valuation')
  @ApiOperation({
    summary: 'Enterprise Business Valuation & Resilience Rating',
    description:
      'Calculates dynamic enterprise valuation with discounts for unhedged FX volatility and war risk, returning AAA-CCC resilience rating.',
  })
  async getEnterpriseValuation(
    @Query('tenantId') tenantId: string = 'default',
  ): Promise<BusinessValuationInsight> {
    const report = await this.anaxService.generateComprehensiveReport(tenantId);
    return report.valuation;
  }

  @Post('evaluate')
  @ApiOperation({
    summary: 'Simulate Trajectory Under Custom Macro Shocks',
    description:
      'Allows business leaders to model scenarios (e.g. 20% crude oil price jump, 10% currency devaluation, Red Sea chokepoint closure).',
  })
  async evaluateScenario(
    @Body() scenario: { tenantId?: string; customWorld?: Partial<WorldMacroSignal> },
  ): Promise<ComprehensiveBusinessIntelligenceReport> {
    const tenantId = scenario.tenantId ?? 'default';
    return this.anaxService.generateComprehensiveReport(tenantId, scenario.customWorld);
  }
}

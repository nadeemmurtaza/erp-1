import { Test, TestingModule } from '@nestjs/testing';
import { AnaxService } from './anax.service';
import { AnaxSensorService } from './anax-sensor.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AnaxService (Dragonfly Intercept Intelligence in ERP-1)', () => {
  let service: AnaxService;
  let sensorService: AnaxSensorService;

  const mockPrisma = {
    order: {
      count: jest.fn().mockResolvedValue(120),
      aggregate: jest.fn().mockResolvedValue({ _avg: { grandTotal: 450000 } }),
    },
    returnRequest: {
      count: jest.fn().mockResolvedValue(4),
    },
    productVariant: {
      count: jest.fn().mockResolvedValue(350),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnaxService,
        AnaxSensorService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AnaxService>(AnaxService);
    sensorService = module.get<AnaxSensorService>(AnaxSensorService);
  });

  it('synthesizes 16-neuron normalized state-space vector with positive momentum', async () => {
    const internal = await sensorService.gatherInternalTelemetry('tenant-test');
    const world = sensorService.gatherWorldMacroSignals();

    const vector = service.synthesizeStateVector(internal, world);

    expect(vector.n1_demand_momentum).toBeGreaterThan(0);
    expect(vector.n12_liquidity_runway_days).toBeGreaterThan(5);
    expect(vector.n15_refund_fraud_anomaly).toBeLessThan(0.5);
  });

  it('calculates Proportional Navigation intercept point with high targeting accuracy', async () => {
    const internal = await sensorService.gatherInternalTelemetry('tenant-test');
    const world = sensorService.gatherWorldMacroSignals();
    const vector = service.synthesizeStateVector(internal, world);

    const intercept = service.calculateIntercept(vector, 100_000_000, 500_000_000, 30);

    expect(intercept.closingVelocity).toBeGreaterThan(0);
    expect(intercept.predictedDemandMinor).toBeGreaterThan(0);
    expect(intercept.zeroEffortMissDistance).toBeGreaterThanOrEqual(0);

    const flightCommand = service.synthesizeFlightCommands('tenant-test', vector, intercept);
    expect(flightCommand.confidenceScore).toBeGreaterThanOrEqual(0.85);
  });

  it('evaluates geopolitical war risk, maritime chokepoints, and freight inflation', async () => {
    const internal = await sensorService.gatherInternalTelemetry('tenant-test');
    const worldWithWar = sensorService.gatherWorldMacroSignals({
      geopolitical: {
        bilateralTensionIndex: 0.88,
        sanctionsSeverityIndex: 0.72,
        freightWarRiskSurchargePercent: 0.35,
        chokepoints: {
          babElMandebRedSea: 0.95,
          suezCanal: 0.85,
        },
      },
    });

    const vector = service.synthesizeStateVector(internal, worldWithWar);
    const geoRisk = service.evaluateGeopoliticalRisk(vector, worldWithWar);

    expect(geoRisk.supplyRouteVulnerability).toBe('HAZARDOUS');
    expect(geoRisk.sanctionExposure).toBe('SEVERE');
    expect(geoRisk.chokepointsAtRisk.length).toBeGreaterThanOrEqual(2);
    expect(geoRisk.projectedFreightInflationPercent).toBeGreaterThan(20);
    expect(geoRisk.guidance).toContain('Cape of Good Hope');
  });

  it('evaluates foreign exchange depreciation risk and triggers forward hedging in Wing 3', async () => {
    const internal = await sensorService.gatherInternalTelemetry('tenant-test');
    const worldWithFxShock = sensorService.gatherWorldMacroSignals({
      fxVolatilityPercent: 7.5,
      commoditiesForex: {
        crudeOilPriceUsd: 96.0,
        crudeOilDelta30dPercent: 15.0,
        energyTariffIndex: 1.3,
        devaluationRiskScore: 0.65,
        fxRates: {
          'USD/PKR': { rate: 290.0, delta30dPercent: 5.5, volatilityIndex: 0.6 },
        },
      },
    });

    const vector = service.synthesizeStateVector(internal, worldWithFxShock);
    const fxInsight = service.evaluateForex('USD/PKR', vector, worldWithFxShock);

    expect(fxInsight.direction).toBe('DEPRECIATING');
    expect(fxInsight.hedgingUrgency).toBe('URGENT');

    const intercept = service.calculateIntercept(vector, 100_000_000, 500_000_000, 30);
    const flight = service.synthesizeFlightCommands('tenant-test', vector, intercept);
    expect(flight.wing3_liquidity.recommendedFxHedging).toBe(true);
  });

  it('generates a comprehensive business intelligence report with enterprise valuation', async () => {
    const report = await service.generateComprehensiveReport('tenant-test');

    expect(report.tenantId).toBe('tenant-test');
    expect(report.executionTimeMs).toBeLessThan(500.0);
    expect(report.valuation.estimatedEnterpriseValueMinor).toBeGreaterThan(0);
    expect(['AAA', 'AA', 'A', 'BBB', 'BB']).toContain(report.valuation.resilienceRating);
    expect(report.executiveSummary.length).toBeGreaterThanOrEqual(3);
  });
});

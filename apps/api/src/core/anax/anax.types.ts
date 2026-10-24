/**
 * ANAX Dragonfly Predictive Intercept Architecture - ERP Types
 *
 * Implements Sandia National Labs-inspired biological guidance and trajectory interception
 * for enterprise SaaS business operations.
 */

export interface InternalTelemetrySignal {
  tenantId: string;
  organizationId?: string;
  timestamp: string;

  /** Sales & Transaction velocity (POS & Storefront) */
  orderVelocityPerHour: number;
  averageOrderValueMinor: number;
  cartAbandonmentRate: number;

  /** Cash & Working Capital */
  liquidCashMinor: number;
  expectedInflows7dMinor: number;
  expectedOutflows7dMinor: number;

  /** Inventory & Fulfillment */
  criticalSkuStockoutRiskScore: number; // 0.0 to 1.0
  averageFulfillmentHours: number;
  supplierLeadTimeDays: number;

  /** Customer Experience & Fraud */
  supportTicketBacklog: number;
  refundRequestRate: number;
  liveProofVerificationRate: number;
}

export interface GeopoliticalWarSignal {
  activeConflictZones?: Array<{
    zone: string;
    severity: number;
    tradeImpact: 'low' | 'medium' | 'high' | 'critical';
  }>;
  chokepoints?: {
    suezCanal?: number;
    babElMandebRedSea?: number;
    straitOfHormuz?: number;
    malaccaStrait?: number;
    panamaCanal?: number;
    blackSea?: number;
  };
  bilateralTensionIndex: number;
  sanctionsSeverityIndex: number;
  freightWarRiskSurchargePercent: number;
}

export interface CommodityForexSignal {
  crudeOilPriceUsd: number;
  crudeOilDelta30dPercent: number;
  energyTariffIndex: number;
  fxRates: Record<
    string,
    {
      rate: number;
      delta30dPercent: number;
      volatilityIndex: number;
    }
  >;
  devaluationRiskScore: number;
}

export interface MarketTradesAndEquitiesSignal {
  marketTradeVolumeIndex: number;
  sectorEquityMomentum: number;
  supplierHealthIndex: number;
  competitorPricingPressure: number;
}

export interface WorldMacroSignal {
  timestamp: string;
  inflationRate: number;
  fxVolatilityPercent: number;
  freightCostMultiplier: number;
  activeCalendarEvent?: {
    name: 'Ramadan' | 'Eid' | 'BlackFriday' | 'CyberMonday' | 'NewYear' | 'TaxYearEnd' | string;
    daysUntilEvent: number;
    demandMultiplierEstimate: number;
  };
  supplyDisruptionIndex: number;
  geopolitical?: GeopoliticalWarSignal;
  commoditiesForex?: CommodityForexSignal;
  marketTrades?: MarketTradesAndEquitiesSignal;
}

export interface StateSpaceVector16 {
  // Demand Dimension (Neurons 1-4)
  n1_demand_momentum: number;
  n2_demand_acceleration: number;
  n3_price_elasticity_drift: number;
  n4_market_share_velocity: number;

  // Supply & Logistics Dimension (Neurons 5-8)
  n5_lead_time_compression: number;
  n6_stock_depletion_velocity: number;
  n7_freight_friction: number;
  n8_supplier_reliability_index: number;

  // Cash & Liquidity Dimension (Neurons 9-12)
  n9_burn_rate_velocity: number;
  n10_receivable_lag_ratio: number;
  n11_margin_pressure_index: number;
  n12_liquidity_runway_days: number;

  // Workforce & Customer Retention Dimension (Neurons 13-16)
  n13_churn_risk_acceleration: number;
  n14_support_stress_ratio: number;
  n15_refund_fraud_anomaly: number;
  n16_workforce_capacity_utilization: number;
}

export interface InterceptPoint {
  timeHorizonDays: number;
  predictedDemandMinor: number;
  predictedCashPositionMinor: number;
  projectedStockoutCount: number;
  projectedFraudClaimsCount: number;
  closingVelocity: number;
  lineOfSightRate: number;
  zeroEffortMissDistance: number;
  interceptAngleRad: number;
}

export interface FourWingFlightCommand {
  tenantId: string;
  calculatedAt: string;
  interceptHorizonDays: number;
  confidenceScore: number;

  wing1_pricing: {
    recommendedPriceAdjustmentPercent: number;
    promotionalBudgetMultiplier: number;
    urgencyReason: string;
  };

  wing2_procurement: {
    advancePurchaseOrdersDays: number;
    recommendedSafetyStockBufferPercent: number;
    recommendedRerouteSuppliers: boolean;
    urgencyReason: string;
  };

  wing3_liquidity: {
    recommendedCashReserveMinor: number;
    suggestedPaymentTermExtensionDays: number;
    discountEarlySettlementOffer: boolean;
    recommendedFxHedging: boolean;
    urgencyReason: string;
  };

  wing4_workforce: {
    supportCapacityShiftPercent: number;
    enforceLiveProofReturns: boolean;
    proactiveOutreachTargetCount: number;
    urgencyReason: string;
  };
}

export interface BusinessValuationInsight {
  tenantId: string;
  calculatedAt: string;
  estimatedEnterpriseValueMinor: number;
  annualizedRevenueMinor: number;
  projectedEbitdaMinor: number;
  impliedRevenueMultiple: number;
  impliedEbitdaMultiple: number;
  geopoliticalWarDiscountPercent: number;
  forexDevaluationDiscountPercent: number;
  netEnterpriseResilienceScore: number;
  resilienceRating: 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC';
  strategicRecommendations: string[];
}

export interface StockInventoryEvaluation {
  stockoutRiskScore: number;
  daysUntilCriticalDepletion: number;
  warSupplyFrictionBufferDays: number;
  reorderUrgency: 'CRITICAL_IMMEDIATE' | 'ELEVATED' | 'BALANCED' | 'SURPLUS';
  recommendedSafetyStockMultiplier: number;
  mitigationAdvice: string;
}

export interface ForexPredictionInsight {
  pair: string;
  currentRate: number;
  projected30dRate: number;
  projected90dRate: number;
  depreciationRiskScore: number;
  direction: 'APPRECIATING' | 'DEPRECIATING' | 'RANGEBOUND';
  hedgingUrgency: 'URGENT' | 'MONITOR' | 'UNNECESSARY';
  suggestedAction: string;
}

export interface GeopoliticalRelationshipInsight {
  activeConflictRisk: number;
  chokepointsAtRisk: string[];
  sanctionExposure: 'NONE' | 'MODERATE' | 'SEVERE';
  supplyRouteVulnerability: 'SAFE' | 'CONGESTED' | 'DISRUPTED' | 'HAZARDOUS';
  projectedFreightInflationPercent: number;
  guidance: string;
}

export interface ComprehensiveBusinessIntelligenceReport {
  tenantId: string;
  evaluatedAt: string;
  executionTimeMs: number;
  stateVector: StateSpaceVector16;
  interceptPoint: InterceptPoint;
  flightCommand: FourWingFlightCommand;
  valuation: BusinessValuationInsight;
  geopoliticalRisk: GeopoliticalRelationshipInsight;
  forexInsights: ForexPredictionInsight[];
  summaryUrgency: 'CRITICAL_ACTION_REQUIRED' | 'ELEVATED_RISK' | 'OPERATING_STABLE';
  executiveSummary: string[];
}

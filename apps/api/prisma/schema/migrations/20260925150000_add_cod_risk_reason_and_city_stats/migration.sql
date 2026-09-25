-- WO-9.4, docs/implementation/ai-layer/09-ai-layer.md. The AI-layer
-- foundation migration (20260925050000_add_ai_layer) scaffolded
-- Order.codRiskScore/codRiskAction/codRiskComputedAt up front; this adds the
-- two pieces that scaffold did not anticipate: the staff-facing explanation
-- string, and the nightly-cached per-city inputs CodRiskService reads
-- instead of aggregating Shipment/Order history on every checkout.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "codRiskReasonEn" TEXT;

-- CreateTable
CREATE TABLE "CityCodRiskStat" (
    "city" TEXT NOT NULL,
    "totalShipments" INTEGER NOT NULL,
    "rtoShipments" INTEGER NOT NULL,
    "avgOrderValue" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CityCodRiskStat_pkey" PRIMARY KEY ("city")
);

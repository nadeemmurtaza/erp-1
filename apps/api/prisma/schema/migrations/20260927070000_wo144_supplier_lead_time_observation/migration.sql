-- resilience-scalability/144-supply-chain-resilience-planning-engine.md
-- (WO-144.6, R25) — one row per goods receipt, backfilling a real lead-time
-- distribution from history already in the database. Additive only.
-- Also adds one AiFeature value (WO-144.4, R23) for narration cost/usage
-- logging, following the identical pattern the RAG migration already used.

-- AlterEnum
ALTER TYPE "AiFeature" ADD VALUE 'PLANNING_NARRATION';

-- CreateTable
CREATE TABLE "SupplierLeadTimeObservation" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "observedDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierLeadTimeObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierLeadTimeObservation_supplierId_createdAt_idx" ON "SupplierLeadTimeObservation"("supplierId", "createdAt");

-- resilience-scalability/38-resilience-engineering.md (WO-38.3) —
-- SLO/error-budget instrumentation for checkout, POS sale completion and
-- till -> parent sync. Additive only; no existing table altered.

-- CreateTable
CREATE TABLE "RequestOutcome" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequestOutcome_path_occurredAt_idx" ON "RequestOutcome"("path", "occurredAt");

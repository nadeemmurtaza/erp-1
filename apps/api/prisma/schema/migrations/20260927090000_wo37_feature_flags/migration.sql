-- resilience-scalability/37-scalability-future-upgrades.md (WO-37.2) —
-- the FeatureFlag primitive for staged rollout. Additive only; no existing
-- table altered.

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rolloutPercent" INTEGER NOT NULL DEFAULT 0,
    "enabledOrgIds" TEXT[],
    "killSwitch" BOOLEAN NOT NULL DEFAULT false,
    "moneyOrStockPath" BOOLEAN NOT NULL DEFAULT false,
    "proposedRolloutPercent" INTEGER,
    "proposedKillSwitchOff" BOOLEAN NOT NULL DEFAULT false,
    "proposedById" TEXT,
    "proposedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "removalCriteria" TEXT,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- CreateIndex
CREATE INDEX "FeatureFlag_createdAt_idx" ON "FeatureFlag"("createdAt");

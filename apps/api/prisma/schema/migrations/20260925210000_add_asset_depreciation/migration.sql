-- finance-accounting/147-fixed-asset-depreciation.md (WO-147.1) — book
-- depreciation for hr.prisma's Asset. Additive only. Two new chart-of-
-- accounts rows (1400 Accumulated Depreciation, 5500 Depreciation Expense)
-- are seeded by prisma/seed.ts's existing idempotent upsert loop, not this
-- migration.

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE', 'DECLINING_BALANCE');

-- CreateTable
CREATE TABLE "AssetDepreciationSchedule" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "method" "DepreciationMethod" NOT NULL,
    "acquisitionCostMinor" INTEGER NOT NULL,
    "salvageValueMinor" INTEGER NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "decliningRateBps" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "AssetDepreciationSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDepreciationPosting" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetDepreciationPosting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetDepreciationSchedule_assetId_key" ON "AssetDepreciationSchedule"("assetId");

-- CreateIndex
CREATE INDEX "AssetDepreciationSchedule_closedAt_idx" ON "AssetDepreciationSchedule"("closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetDepreciationPosting_scheduleId_periodStart_key" ON "AssetDepreciationPosting"("scheduleId", "periodStart");

-- CreateIndex
CREATE INDEX "AssetDepreciationPosting_scheduleId_idx" ON "AssetDepreciationPosting"("scheduleId");

-- AddForeignKey
ALTER TABLE "AssetDepreciationSchedule" ADD CONSTRAINT "AssetDepreciationSchedule_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDepreciationSchedule" ADD CONSTRAINT "AssetDepreciationSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDepreciationPosting" ADD CONSTRAINT "AssetDepreciationPosting_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AssetDepreciationSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

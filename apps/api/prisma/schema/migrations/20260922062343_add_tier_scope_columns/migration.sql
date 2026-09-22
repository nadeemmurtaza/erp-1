-- WO-23.3a (RETAIL-ERP.md R13/R8, ADR-021): the shared scopeLevel/
-- originNodeId pattern on PurchaseOrder/BomProductionRun/Expense, plus the
-- locationId columns purchasing and bom production need to receive/produce
-- anywhere other than the single default Location a Solo deployment has
-- always used. scopeLevel defaults BRAND ("brand purchasing is the default
-- and behaves as today" — R13); originNodeId stays NULL for history, since
-- no fact recorded before this column existed can honestly claim a node.
-- locationId is backfilled to today's one default Location, then made
-- NOT NULL, so every existing row keeps meaning exactly what it always
-- meant (received/produced at the shop's one location) with no silent gap.

-- CreateEnum
CREATE TYPE "ScopeLevel" AS ENUM ('ORG', 'BRAND', 'BRANCH');

-- AlterEnum
ALTER TYPE "LocationType" ADD VALUE 'PRODUCTION';

-- AlterTable
ALTER TABLE "PurchaseOrder"
  ADD COLUMN "scopeLevel" "ScopeLevel" NOT NULL DEFAULT 'BRAND',
  ADD COLUMN "originNodeId" TEXT;

-- AlterTable
ALTER TABLE "Expense"
  ADD COLUMN "scopeLevel" "ScopeLevel" NOT NULL DEFAULT 'BRAND',
  ADD COLUMN "originNodeId" TEXT;

-- AlterTable (BomProductionRun) — locationId added nullable first, backfilled, then locked.
ALTER TABLE "BomProductionRun"
  ADD COLUMN "scopeLevel" "ScopeLevel" NOT NULL DEFAULT 'BRAND',
  ADD COLUMN "originNodeId" TEXT,
  ADD COLUMN "locationId" TEXT;

UPDATE "BomProductionRun"
SET "locationId" = (SELECT id FROM "Location" WHERE "isDefault" = true LIMIT 1)
WHERE "locationId" IS NULL;

ALTER TABLE "BomProductionRun" ALTER COLUMN "locationId" SET NOT NULL;

-- AlterTable (GoodsReceipt) — same expand/backfill/contract as above.
ALTER TABLE "GoodsReceipt" ADD COLUMN "locationId" TEXT;

UPDATE "GoodsReceipt"
SET "locationId" = (SELECT id FROM "Location" WHERE "isDefault" = true LIMIT 1)
WHERE "locationId" IS NULL;

ALTER TABLE "GoodsReceipt" ALTER COLUMN "locationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "PurchaseOrder_scopeLevel_idx" ON "PurchaseOrder"("scopeLevel");

-- CreateIndex
CREATE INDEX "Expense_scopeLevel_idx" ON "Expense"("scopeLevel");

-- CreateIndex
CREATE INDEX "BomProductionRun_scopeLevel_idx" ON "BomProductionRun"("scopeLevel");

-- CreateIndex
CREATE INDEX "BomProductionRun_locationId_idx" ON "BomProductionRun"("locationId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_locationId_idx" ON "GoodsReceipt"("locationId");

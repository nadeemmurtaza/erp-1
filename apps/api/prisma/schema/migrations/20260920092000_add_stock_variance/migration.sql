-- StockVariance: the exception queue for every oversell
-- InventoryService.postUnconditional() lets through (RETAIL-ERP.md R5 — a
-- sale that already happened is never rejected by sync).
--
-- One row per oversell, paired 1:1 with the POS_OFFLINE_VARIANCE StockMovement
-- that recorded the negative delta — hence the UNIQUE on stockMovementId, which
-- is what makes the pairing enforceable rather than conventional.
--
-- refType/refId rather than a relation, following StockMovement's own
-- convention, so `inventory` stays independent of `orders` and `pos`.

-- CreateEnum
CREATE TYPE "StockVarianceStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "StockVariance" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "overshootQty" INTEGER NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "status" "StockVarianceStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockVariance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockVariance_stockMovementId_key" ON "StockVariance"("stockMovementId");

-- CreateIndex
CREATE INDEX "StockVariance_status_idx" ON "StockVariance"("status");

-- CreateIndex
CREATE INDEX "StockVariance_variantId_idx" ON "StockVariance"("variantId");

-- CreateIndex
CREATE INDEX "StockVariance_locationId_idx" ON "StockVariance"("locationId");

-- AddForeignKey
ALTER TABLE "StockVariance" ADD CONSTRAINT "StockVariance_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockVariance" ADD CONSTRAINT "StockVariance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

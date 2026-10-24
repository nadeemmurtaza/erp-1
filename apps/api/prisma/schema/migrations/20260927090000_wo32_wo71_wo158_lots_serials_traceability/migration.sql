-- lots-serials-traceability: doc 32 (lots/FEFO/recall), doc 71 (batch
-- genealogy connecting bom's production run to lots), doc 158 (serialized
-- unit tracking). DECISIONS.md ADR-068.
--
-- Hand-written, forward-only (ADR-008). Purely additive. No organizationId
-- anywhere (ADR-040/044/046/049/060/062/064/065): this deployment IS the
-- tenant boundary — SerializedUnit.serialNumber is unique across the whole
-- deployment, not per-org (stricter than doc 158's own sketch, and more
-- correct for a manufacturer-assigned identifier like an IMEI). Lot and
-- SerializedUnit are sub-ledgers under the existing VariantLocationStock
-- row, never a second stock model — LotsService/SerializedUnitsService
-- remain the only writers of their own invariants, the same "one writer
-- per invariant" discipline InventoryService.move() already establishes.

-- CreateEnum
CREATE TYPE "SerializedUnitStatus" AS ENUM ('IN_STOCK', 'SOLD', 'RETURNED', 'RMA_TO_SUPPLIER', 'WRITTEN_OFF');

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "lotCode" TEXT NOT NULL,
    "expiresOn" TIMESTAMP(3),
    "receivedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceReceiptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotStock" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LotStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotAllocation" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerializedUnit" (
    "id" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "status" "SerializedUnitStatus" NOT NULL DEFAULT 'IN_STOCK',
    "lotId" TEXT,
    "locationId" TEXT,
    "orderId" TEXT,
    "stockMovementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SerializedUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomProductionLineLot" (
    "id" TEXT NOT NULL,
    "productionLineId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "quantityBase" INTEGER NOT NULL,

    CONSTRAINT "BomProductionLineLot_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN "lotTracked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "tracksSerials" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "warrantyMonths" INTEGER;

-- AlterTable
ALTER TABLE "StockVariance" ADD COLUMN "serializedUnitId" TEXT;

-- AlterTable
ALTER TABLE "BomProductionRun" ADD COLUMN "outputLotId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lot_productVariantId_lotCode_key" ON "Lot"("productVariantId", "lotCode");

-- CreateIndex
CREATE INDEX "Lot_expiresOn_idx" ON "Lot"("expiresOn");

-- CreateIndex
CREATE UNIQUE INDEX "LotStock_lotId_locationId_key" ON "LotStock"("lotId", "locationId");

-- CreateIndex
CREATE INDEX "LotStock_locationId_idx" ON "LotStock"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "LotAllocation_lotId_stockMovementId_key" ON "LotAllocation"("lotId", "stockMovementId");

-- CreateIndex
CREATE INDEX "LotAllocation_lotId_idx" ON "LotAllocation"("lotId");

-- CreateIndex
CREATE INDEX "LotAllocation_stockMovementId_idx" ON "LotAllocation"("stockMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "SerializedUnit_serialNumber_key" ON "SerializedUnit"("serialNumber");

-- CreateIndex
CREATE INDEX "SerializedUnit_productVariantId_status_idx" ON "SerializedUnit"("productVariantId", "status");

-- CreateIndex
CREATE INDEX "SerializedUnit_orderId_idx" ON "SerializedUnit"("orderId");

-- CreateIndex
CREATE INDEX "SerializedUnit_stockMovementId_idx" ON "SerializedUnit"("stockMovementId");

-- CreateIndex
CREATE INDEX "BomProductionLineLot_productionLineId_idx" ON "BomProductionLineLot"("productionLineId");

-- CreateIndex
CREATE INDEX "BomProductionLineLot_lotId_idx" ON "BomProductionLineLot"("lotId");

-- CreateIndex
CREATE INDEX "StockVariance_serializedUnitId_idx" ON "StockVariance"("serializedUnitId");

-- CreateIndex
CREATE INDEX "BomProductionRun_outputLotId_idx" ON "BomProductionRun"("outputLotId");

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotStock" ADD CONSTRAINT "LotStock_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotStock" ADD CONSTRAINT "LotStock_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotAllocation" ADD CONSTRAINT "LotAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotAllocation" ADD CONSTRAINT "LotAllocation_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerializedUnit" ADD CONSTRAINT "SerializedUnit_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerializedUnit" ADD CONSTRAINT "SerializedUnit_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerializedUnit" ADD CONSTRAINT "SerializedUnit_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerializedUnit" ADD CONSTRAINT "SerializedUnit_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomProductionLineLot" ADD CONSTRAINT "BomProductionLineLot_productionLineId_fkey" FOREIGN KEY ("productionLineId") REFERENCES "BomProductionLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomProductionLineLot" ADD CONSTRAINT "BomProductionLineLot_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockVariance" ADD CONSTRAINT "StockVariance_serializedUnitId_fkey" FOREIGN KEY ("serializedUnitId") REFERENCES "SerializedUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomProductionRun" ADD CONSTRAINT "BomProductionRun_outputLotId_fkey" FOREIGN KEY ("outputLotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

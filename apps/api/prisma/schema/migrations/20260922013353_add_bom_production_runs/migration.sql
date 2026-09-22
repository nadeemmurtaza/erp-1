-- WO-23.2's WO-C.3: production runs (10-admin-dashboard.md §C). A run
-- consumes raw stock and credits finished stock, both through
-- InventoryService.move()/moveMany() in the SAME transaction as these rows
-- (production.service.ts) — nothing here writes ProductVariant.stock
-- itself. Every cost column is a SNAPSHOT (Rule 7): a later recipe edit or
-- raw-material cost change must never rewrite what a past run actually
-- cost. Deletion is not supported — a correction is a reversing adjustment
-- through the normal inventory screen, never a DELETE on this table.

-- CreateTable
CREATE TABLE "BomProductionRun" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 1,
    "quantityProduced" INTEGER NOT NULL,
    "materialCost" INTEGER NOT NULL,
    "labourCost" INTEGER NOT NULL,
    "overheadCost" INTEGER NOT NULL,
    "producedUnitCost" INTEGER NOT NULL,
    "notes" TEXT,
    "operatorId" TEXT,
    "producedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BomProductionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomProductionLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantityBase" INTEGER NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "lineCost" INTEGER NOT NULL,

    CONSTRAINT "BomProductionLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BomProductionRun_number_key" ON "BomProductionRun"("number");

-- CreateIndex
CREATE INDEX "BomProductionRun_producedAt_idx" ON "BomProductionRun"("producedAt");

-- CreateIndex
CREATE INDEX "BomProductionRun_recipeId_idx" ON "BomProductionRun"("recipeId");

-- CreateIndex
CREATE INDEX "BomProductionRun_variantId_idx" ON "BomProductionRun"("variantId");

-- CreateIndex
CREATE INDEX "BomProductionLine_runId_idx" ON "BomProductionLine"("runId");

-- CreateIndex
CREATE INDEX "BomProductionLine_rawMaterialId_idx" ON "BomProductionLine"("rawMaterialId");

-- AddForeignKey
ALTER TABLE "BomProductionRun" ADD CONSTRAINT "BomProductionRun_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "BomRecipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomProductionRun" ADD CONSTRAINT "BomProductionRun_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomProductionRun" ADD CONSTRAINT "BomProductionRun_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomProductionLine" ADD CONSTRAINT "BomProductionLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BomProductionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomProductionLine" ADD CONSTRAINT "BomProductionLine_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

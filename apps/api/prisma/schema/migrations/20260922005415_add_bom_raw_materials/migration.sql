-- WO-23.2's WO-C.1: raw materials as inventory items (10-admin-dashboard.md
-- §C, ADR-020). A RawMaterial is a marker row on an ordinary ProductVariant
-- — no new stock/cost/movement machinery, purchasing and inventory work on
-- it unchanged. Recipes (BomComponent, WO-C.2) and production runs
-- (BomProductionRun/BomProductionLine, WO-C.3) are later migrations; nothing
-- here references them.

-- CreateEnum
CREATE TYPE "RawMaterialUnit" AS ENUM ('GAZ', 'METRE', 'PIECE', 'SPOOL', 'GRAM', 'MILLILITRE');

-- CreateTable
CREATE TABLE "RawMaterial" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'fabric',
    "unit" "RawMaterialUnit" NOT NULL,
    "unitScale" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RawMaterial_variantId_key" ON "RawMaterial"("variantId");

-- CreateIndex
CREATE INDEX "RawMaterial_isActive_kind_idx" ON "RawMaterial"("isActive", "kind");

-- CreateIndex
CREATE INDEX "RawMaterial_name_idx" ON "RawMaterial"("name");

-- AddForeignKey
ALTER TABLE "RawMaterial" ADD CONSTRAINT "RawMaterial_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

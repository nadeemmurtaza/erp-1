-- pos-hardware/31-sector-pos-hardware-integration.md (WO-31.2) — a line's
-- modifier set / non-typed quantity source, and park/retrieve for tabs and
-- tables. Additive only; no existing pos table altered.

-- CreateEnum
CREATE TYPE "QuantitySource" AS ENUM ('TYPED', 'SCALE_WEIGHT', 'BOM_RECIPE_SCALE');

-- CreateEnum
CREATE TYPE "PosOrderType" AS ENUM ('COUNTER', 'TAB', 'TABLE');

-- CreateTable
CREATE TABLE "PosLineModifier" (
    "id" TEXT NOT NULL,
    "lineRef" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "priceDeltaMinor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosLineModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosLineQuantitySource" (
    "lineRef" TEXT NOT NULL,
    "source" "QuantitySource" NOT NULL,
    "recipeId" TEXT,

    CONSTRAINT "PosLineQuantitySource_pkey" PRIMARY KEY ("lineRef")
);

-- CreateTable
CREATE TABLE "PosParkedSale" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "orderType" "PosOrderType" NOT NULL DEFAULT 'COUNTER',
    "label" TEXT NOT NULL,
    "basketSnapshot" JSONB NOT NULL,
    "parkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retrievedAt" TIMESTAMP(3),

    CONSTRAINT "PosParkedSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosLineModifier_lineRef_idx" ON "PosLineModifier"("lineRef");

-- CreateIndex
CREATE INDEX "PosParkedSale_shiftId_retrievedAt_idx" ON "PosParkedSale"("shiftId", "retrievedAt");

-- AddForeignKey
ALTER TABLE "PosParkedSale" ADD CONSTRAINT "PosParkedSale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

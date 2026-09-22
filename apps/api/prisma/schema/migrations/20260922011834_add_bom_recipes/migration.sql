-- WO-23.2's WO-C.2: recipes and the COGS rollup (10-admin-dashboard.md §C).
-- BomRecipe is the recipe for one finished ProductVariant; BomComponent is
-- one raw-material line on it. rolledUpUnitCost/costComplete are a cache
-- recomputed by cost-rollup.ts on every edit and on GoodsReceived
-- (bom.listener.ts) — never the source of truth for a sale's actual COGS,
-- which stays OrderItem.unitCost (Rule 7). No nesting in v1: a component's
-- raw material may not itself carry a recipe, enforced in recipe.service.ts,
-- not here. Production runs (BomProductionRun, WO-C.3) are a later
-- migration; BomRecipe.runs is not added until then.

-- CreateEnum
CREATE TYPE "BomStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "BomRecipe" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "status" "BomStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "outputQuantity" INTEGER NOT NULL DEFAULT 1,
    "wastageBps" INTEGER NOT NULL DEFAULT 0,
    "labourCost" INTEGER NOT NULL DEFAULT 0,
    "overheadCost" INTEGER NOT NULL DEFAULT 0,
    "rolledUpUnitCost" INTEGER NOT NULL DEFAULT 0,
    "costComplete" BOOLEAN NOT NULL DEFAULT false,
    "costComputedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BomRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomComponent" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "quantityBase" INTEGER NOT NULL,
    "wastageBps" INTEGER,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BomComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BomRecipe_variantId_key" ON "BomRecipe"("variantId");

-- CreateIndex
CREATE INDEX "BomRecipe_status_idx" ON "BomRecipe"("status");

-- CreateIndex
CREATE INDEX "BomRecipe_costComplete_idx" ON "BomRecipe"("costComplete");

-- CreateIndex
CREATE INDEX "BomComponent_rawMaterialId_idx" ON "BomComponent"("rawMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "BomComponent_recipeId_rawMaterialId_key" ON "BomComponent"("recipeId", "rawMaterialId");

-- AddForeignKey
ALTER TABLE "BomRecipe" ADD CONSTRAINT "BomRecipe_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomRecipe" ADD CONSTRAINT "BomRecipe_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomComponent" ADD CONSTRAINT "BomComponent_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "BomRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomComponent" ADD CONSTRAINT "BomComponent_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

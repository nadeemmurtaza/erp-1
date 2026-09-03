-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "locationId" TEXT;

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "address" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantLocationStock" (
    "variantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariantLocationStock_pkey" PRIMARY KEY ("variantId","locationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");

-- CreateIndex
CREATE INDEX "Location_isActive_idx" ON "Location"("isActive");

-- CreateIndex
CREATE INDEX "StockMovement_locationId_idx" ON "StockMovement"("locationId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantLocationStock" ADD CONSTRAINT "VariantLocationStock_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantLocationStock" ADD CONSTRAINT "VariantLocationStock_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (17-inventory-locations.md): every deployment gets exactly one
-- default Location. A single-location shop's ProductVariant.stock values
-- must be byte-identical before and after this migration — see
-- InventoryService.move(), which now reads/writes VariantLocationStock and
-- recomputes ProductVariant.stock as the sum across locations.
INSERT INTO "Location" ("id", "name", "code", "isDefault", "isActive")
VALUES ('loc_main_default', 'Main', 'MAIN', true, true);

-- One VariantLocationStock row per existing variant, at the default
-- location, seeded from the variant's current (pre-migration) stock.
INSERT INTO "VariantLocationStock" ("variantId", "locationId", "quantity", "updatedAt")
SELECT "id", 'loc_main_default', "stock", CURRENT_TIMESTAMP
FROM "ProductVariant";

-- Every movement that has ever happened, happened at the (only) default
-- location — this column becomes required in a later, separate migration
-- once every deployment has run this backfill (00-HOUSE-RULES.md §4).
UPDATE "StockMovement" SET "locationId" = 'loc_main_default';

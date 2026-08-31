-- WO-1.3: Cost price and COGS
-- Adds cost tracking to ProductVariant and snapshots unitCost on OrderItem.
--
-- barcode is String? @unique. Postgres unique indexes tolerate multiple NULLs
-- (NULLs are never considered equal for unique-index purposes), so all
-- existing NULL rows are fine.

-- AlterTable "ProductVariant"
ALTER TABLE "ProductVariant"
  ADD COLUMN "barcode"             TEXT,
  ADD COLUMN "costPrice"           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastReceivedAt"      TIMESTAMP(3),
  ADD COLUMN "preferredSupplierId" TEXT,
  ADD COLUMN "reorderPoint"        INTEGER,
  ADD COLUMN "reorderQuantity"     INTEGER;

-- CreateIndex (unique, NULL-tolerant -- standard Postgres behaviour)
CREATE UNIQUE INDEX "ProductVariant_barcode_key"
  ON "ProductVariant"("barcode");

-- AlterTable "OrderItem"
ALTER TABLE "OrderItem"
  ADD COLUMN "unitCost" INTEGER NOT NULL DEFAULT 0;

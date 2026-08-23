-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "garmentTypeId" TEXT;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_garmentTypeId_fkey" FOREIGN KEY ("garmentTypeId") REFERENCES "GarmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing stitched lines took their garment from the chosen service product.
UPDATE "CartItem" AS item
SET "garmentTypeId" = service."garmentTypeId"
FROM "Product" AS service
WHERE item."stitchingServiceId" = service."id"
  AND item."garmentTypeId" IS NULL;

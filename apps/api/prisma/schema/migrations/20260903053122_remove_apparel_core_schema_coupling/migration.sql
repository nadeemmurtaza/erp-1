-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProductKind" ADD VALUE 'GOODS';
ALTER TYPE "ProductKind" ADD VALUE 'SERVICE';
ALTER TYPE "ProductKind" ADD VALUE 'DIGITAL';

-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_garmentTypeId_fkey";

-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_measurementProfileId_fkey";

-- DropForeignKey
ALTER TABLE "MeasurementProfile" DROP CONSTRAINT "MeasurementProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_garmentTypeId_fkey";

-- DropForeignKey
ALTER TABLE "ProductGarmentType" DROP CONSTRAINT "ProductGarmentType_garmentTypeId_fkey";

-- DropForeignKey
ALTER TABLE "StitchingJob" DROP CONSTRAINT "StitchingJob_assignedTailorId_fkey";

-- DropForeignKey
ALTER TABLE "StitchingJob" DROP CONSTRAINT "StitchingJob_orderItemId_fkey";

-- DropForeignKey
ALTER TABLE "StitchingJobEvent" DROP CONSTRAINT "StitchingJobEvent_actorId_fkey";

-- DropForeignKey
ALTER TABLE "StitchingOrder" DROP CONSTRAINT "StitchingOrder_contactId_fkey";

-- DropForeignKey
ALTER TABLE "StitchingOrder" DROP CONSTRAINT "StitchingOrder_userId_fkey";

-- DropForeignKey
ALTER TABLE "TailorProfile" DROP CONSTRAINT "TailorProfile_userId_fkey";

-- CreateTable
CREATE TABLE "ProductOption" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOptionValue" (
    "id" TEXT NOT NULL,
    "productOptionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ProductOptionValueToProductVariant" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProductOptionValueToProductVariant_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_productId_name_key" ON "ProductOption"("productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValue_productOptionId_value_key" ON "ProductOptionValue"("productOptionId", "value");

-- CreateIndex
CREATE INDEX "_ProductOptionValueToProductVariant_B_index" ON "_ProductOptionValueToProductVariant"("B");

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_productOptionId_fkey" FOREIGN KEY ("productOptionId") REFERENCES "ProductOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductOptionValueToProductVariant" ADD CONSTRAINT "_ProductOptionValueToProductVariant_A_fkey" FOREIGN KEY ("A") REFERENCES "ProductOptionValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductOptionValueToProductVariant" ADD CONSTRAINT "_ProductOptionValueToProductVariant_B_fkey" FOREIGN KEY ("B") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "OptionDisplay" AS ENUM ('BUTTON', 'DROPDOWN', 'SWATCH', 'TEXT');

-- DropForeignKey
ALTER TABLE "ProductOptionValue" DROP CONSTRAINT "ProductOptionValue_productOptionId_fkey";

-- DropForeignKey
ALTER TABLE "_ProductOptionValueToProductVariant" DROP CONSTRAINT "_ProductOptionValueToProductVariant_A_fkey";

-- DropForeignKey
ALTER TABLE "_ProductOptionValueToProductVariant" DROP CONSTRAINT "_ProductOptionValueToProductVariant_B_fkey";

-- DropIndex
DROP INDEX "ProductOption_productId_name_key";

-- DropIndex
DROP INDEX "ProductOptionValue_productOptionId_value_key";

-- AlterTable
ALTER TABLE "ProductOption" DROP COLUMN "name",
ADD COLUMN     "display" "OptionDisplay" NOT NULL DEFAULT 'BUTTON',
ADD COLUMN     "key" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ProductOptionValue" DROP COLUMN "productOptionId",
DROP COLUMN "value",
ADD COLUMN     "key" TEXT NOT NULL,
ADD COLUMN     "optionId" TEXT NOT NULL,
ADD COLUMN     "swatchHex" TEXT,
ADD COLUMN     "swatchUrl" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "label" TEXT;

-- DropTable
DROP TABLE "_ProductOptionValueToProductVariant";

-- CreateTable
CREATE TABLE "ProductOptionTranslation" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ProductOptionTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOptionValueTranslation" (
    "id" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ProductOptionValueTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariantOptionValue" (
    "variantId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,

    CONSTRAINT "ProductVariantOptionValue_pkey" PRIMARY KEY ("variantId","optionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionTranslation_optionId_locale_key" ON "ProductOptionTranslation"("optionId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValueTranslation_valueId_locale_key" ON "ProductOptionValueTranslation"("valueId", "locale");

-- CreateIndex
CREATE INDEX "ProductVariantOptionValue_valueId_idx" ON "ProductVariantOptionValue"("valueId");

-- CreateIndex
CREATE INDEX "ProductOption_productId_order_idx" ON "ProductOption"("productId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_productId_key_key" ON "ProductOption"("productId", "key");

-- CreateIndex
CREATE INDEX "ProductOptionValue_optionId_order_idx" ON "ProductOptionValue"("optionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValue_optionId_key_key" ON "ProductOptionValue"("optionId", "key");

-- AddForeignKey
ALTER TABLE "ProductOptionTranslation" ADD CONSTRAINT "ProductOptionTranslation_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValueTranslation" ADD CONSTRAINT "ProductOptionValueTranslation_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "ProductOptionValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "ProductOptionValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


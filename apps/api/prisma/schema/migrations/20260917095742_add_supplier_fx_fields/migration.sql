/*
  Warnings:

  - Added the required column `baseAmountMinor` to the `SupplierBill` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "country" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'PKR',
ADD COLUMN     "incoterms" TEXT,
ADD COLUMN     "isInternational" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxId" TEXT;

-- AlterTable
ALTER TABLE "SupplierBill" ADD COLUMN     "baseAmountMinor" INTEGER NOT NULL,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'PKR',
ADD COLUMN     "fxRateScaled" INTEGER NOT NULL DEFAULT 1000000;

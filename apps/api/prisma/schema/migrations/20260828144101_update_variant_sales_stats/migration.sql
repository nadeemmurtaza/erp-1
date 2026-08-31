-- AlterTable
ALTER TABLE "VariantSalesStat" ADD COLUMN     "isDeadStock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSlowMover" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastLowStockAlertAt" TIMESTAMP(3);

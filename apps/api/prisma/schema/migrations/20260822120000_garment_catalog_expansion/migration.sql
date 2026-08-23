-- AlterTable
ALTER TABLE "GarmentType" ADD COLUMN     "baseFabricGaz" DOUBLE PRECISION,
ADD COLUMN     "aliasesEn" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "aliasesUr" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "sizeToken" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "sizeToken" TEXT;

-- CreateTable
CREATE TABLE "GarmentSizeChart" (
    "id" TEXT NOT NULL,
    "garmentTypeId" TEXT NOT NULL,
    "sizeToken" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GarmentSizeChart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GarmentSizeChart_garmentTypeId_sizeToken_key" ON "GarmentSizeChart"("garmentTypeId", "sizeToken");

-- CreateIndex
CREATE INDEX "GarmentSizeChart_garmentTypeId_order_idx" ON "GarmentSizeChart"("garmentTypeId", "order");

-- AddForeignKey
ALTER TABLE "GarmentSizeChart" ADD CONSTRAINT "GarmentSizeChart_garmentTypeId_fkey" FOREIGN KEY ("garmentTypeId") REFERENCES "GarmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

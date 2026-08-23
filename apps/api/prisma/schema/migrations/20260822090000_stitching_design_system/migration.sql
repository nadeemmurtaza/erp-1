-- AlterTable
ALTER TABLE "GarmentType" ADD COLUMN     "stitchingPrice" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stitchingEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "StitchingOptionGroup" ADD COLUMN     "area" TEXT,
ADD COLUMN     "allowCustomText" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "helpEn" TEXT,
ADD COLUMN     "helpUr" TEXT;

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "measurementValues" JSONB,
ADD COLUMN     "customDesignText" JSONB;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "measurementValues" JSONB,
ADD COLUMN     "customDesignText" JSONB;

-- CreateIndex
CREATE INDEX "StitchingOptionGroup_area_order_idx" ON "StitchingOptionGroup"("area", "order");

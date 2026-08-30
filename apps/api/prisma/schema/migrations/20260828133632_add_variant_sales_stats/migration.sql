-- CreateTable
CREATE TABLE "VariantSalesStat" (
    "variantId" TEXT NOT NULL,
    "units30" INTEGER NOT NULL DEFAULT 0,
    "units90" INTEGER NOT NULL DEFAULT 0,
    "lastSoldAt" TIMESTAMP(3),
    "daysOfCover" DOUBLE PRECISION,
    "ageDays" INTEGER,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariantSalesStat_pkey" PRIMARY KEY ("variantId")
);

-- AddForeignKey
ALTER TABLE "VariantSalesStat" ADD CONSTRAINT "VariantSalesStat_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

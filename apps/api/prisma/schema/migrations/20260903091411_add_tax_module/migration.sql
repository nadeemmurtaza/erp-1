-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "taxAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxRateBps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "taxClassId" TEXT;

-- CreateTable
CREATE TABLE "TaxClass" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "taxClassId" TEXT NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxClass_key_key" ON "TaxClass"("key");

-- CreateIndex
CREATE INDEX "TaxClass_isDefault_idx" ON "TaxClass"("isDefault");

-- CreateIndex
CREATE INDEX "TaxRate_taxClassId_effectiveAt_idx" ON "TaxRate"("taxClassId", "effectiveAt");

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_taxClassId_fkey" FOREIGN KEY ("taxClassId") REFERENCES "TaxClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_taxClassId_fkey" FOREIGN KEY ("taxClassId") REFERENCES "TaxClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WO-150.1 (150-product-kitting-bundles.md) — additive only.
-- Hand-edited: the raw diff also emitted DROP INDEX statements for
-- pre-existing vector/trigram search indexes unrelated to this change (the
-- same schema-drift artifact seen in the wo146/wo47 migrations) — removed
-- per this repo's own migration discipline.

-- CreateTable
CREATE TABLE "ProductBundle" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleComponent" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "componentVariantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BundleComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductBundle_variantId_key" ON "ProductBundle"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "BundleComponent_bundleId_componentVariantId_key" ON "BundleComponent"("bundleId", "componentVariantId");

-- AddForeignKey
ALTER TABLE "BundleComponent" ADD CONSTRAINT "BundleComponent_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "ProductBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WO-146.1 (146-wholesale-tiered-pricing.md) — additive only.
-- Hand-edited: `prisma migrate dev --create-only` also emitted DROP INDEX
-- statements for DocumentChunk_embedding_idx, OrgUnit_path_idx,
-- ProductTranslation_embedding_idx, ProductTranslation_name_trgm_idx and
-- ProductTranslation_searchVector_idx — unrelated schema drift the shadow
-- database diff picked up (these are almost certainly raw-SQL-created
-- indexes, e.g. pgvector/trigram, that a plain Prisma migration diff cannot
-- represent faithfully), not anything this change touches. Removed per this
-- repo's own migration discipline ("hand-written forward-only migrations,
-- never a raw migrate diff applied blindly") — dropping a live search/
-- vector index as a side effect of an unrelated pricing migration would be
-- a real, silent regression.

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceListEntry" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceMinor" INTEGER NOT NULL,

    CONSTRAINT "PriceListEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceListAssignment" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "customerId" TEXT,
    "tagId" TEXT,

    CONSTRAINT "PriceListAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceList_key_key" ON "PriceList"("key");

-- CreateIndex
CREATE INDEX "PriceListEntry_variantId_idx" ON "PriceListEntry"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceListEntry_priceListId_variantId_minQuantity_key" ON "PriceListEntry"("priceListId", "variantId", "minQuantity");

-- CreateIndex
CREATE INDEX "PriceListAssignment_customerId_idx" ON "PriceListAssignment"("customerId");

-- CreateIndex
CREATE INDEX "PriceListAssignment_tagId_idx" ON "PriceListAssignment"("tagId");

-- AddForeignKey
ALTER TABLE "PriceListEntry" ADD CONSTRAINT "PriceListEntry_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListAssignment" ADD CONSTRAINT "PriceListAssignment_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- launchpad-apps/234-auction-app.md (WO-234.12) — photographs of a lot.
-- Additive only: one table and its index, nothing existing is touched. A lot
-- that has no rows here simply has no photo, which is every lot today.
--
-- "order" is not unique on purpose: a reorder rewrites a lot's rows inside one
-- transaction under the auction's row lock, and a unique constraint would make
-- the order of those writes matter. The foreign key restricts rather than
-- cascades: a lot is withdrawn, never deleted, and a photo is removed by its
-- own row.

-- CreateTable
CREATE TABLE "AuctionLotImage" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionLotImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuctionLotImage_lotId_order_idx" ON "AuctionLotImage"("lotId", "order");

-- AddForeignKey
ALTER TABLE "AuctionLotImage" ADD CONSTRAINT "AuctionLotImage_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "AuctionLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

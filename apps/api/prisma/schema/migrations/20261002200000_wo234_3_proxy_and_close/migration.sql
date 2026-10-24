-- launchpad-apps/234-auction-app.md (WO-234.3) — proxy bidding, anti-snipe and
-- the open/close job: a lot's own end and the extension it has used, the
-- encrypted proxy maximum, and the result of a closed lot. Additive only.

-- AlterTable: a lot's end once moved, and the anti-snipe time spent
ALTER TABLE "AuctionLot"
    ADD COLUMN "endsAt" TIMESTAMP(3),
    ADD COLUMN "extendedMs" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProxyBid" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "maxCipher" TEXT NOT NULL,
    "placedAfterSeq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProxyBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionResult" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "topBidderId" TEXT,
    "topBidMinor" BIGINT,
    "reserveMet" BOOLEAN NOT NULL,
    "bidCount" INTEGER NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuctionResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProxyBid_lotId_bidderId_key" ON "ProxyBid"("lotId", "bidderId");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionResult_lotId_key" ON "AuctionResult"("lotId");

-- AddForeignKey
ALTER TABLE "ProxyBid" ADD CONSTRAINT "ProxyBid_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "AuctionLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProxyBid" ADD CONSTRAINT "ProxyBid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "Bidder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionResult" ADD CONSTRAINT "AuctionResult_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "AuctionLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionResult" ADD CONSTRAINT "AuctionResult_topBidderId_fkey" FOREIGN KEY ("topBidderId") REFERENCES "Bidder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- launchpad-apps/234-auction-app.md (WO-234.2) — bidding: the bidder, the
-- hash-chained bid, the lot's current price and version, and BIGINT prices.
-- Forward-only. The two ALTER COLUMN statements widen INTEGER to BIGINT, which
-- keeps every stored value and rewrites a table that holds one row per lot.

-- CreateEnum
CREATE TYPE "BidKind" AS ENUM ('MANUAL', 'PROXY_AUTO', 'SEALED');

-- CreateEnum
CREATE TYPE "BidderStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED');

-- AlterTable: the auction's frozen bidding rules
ALTER TABLE "Auction" ADD COLUMN "bidRules" JSONB;

-- AlterTable: widen prices before any bid column exists, so no later type change
ALTER TABLE "AuctionLot" ALTER COLUMN "startPriceMinor" TYPE BIGINT;
ALTER TABLE "AuctionLot" ALTER COLUMN "reservePriceMinor" TYPE BIGINT;

-- AlterTable: the lot's current price, leader and version
ALTER TABLE "AuctionLot"
    ADD COLUMN "currentBidMinor" BIGINT,
    ADD COLUMN "leaderBidderId" TEXT,
    ADD COLUMN "bidSeq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Bidder" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "status" "BidderStatus" NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bidder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "kind" "BidKind" NOT NULL DEFAULT 'MANUAL',
    "seq" INTEGER NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "prevHash" TEXT,
    "hash" TEXT NOT NULL,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bidder_auctionId_userId_key" ON "Bidder"("auctionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Bidder_auctionId_alias_key" ON "Bidder"("auctionId", "alias");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_lotId_seq_key" ON "Bid"("lotId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_lotId_bidderId_idempotencyKey_key" ON "Bid"("lotId", "bidderId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Bid_bidderId_acceptedAt_idx" ON "Bid"("bidderId", "acceptedAt");

-- AddForeignKey
ALTER TABLE "Bidder" ADD CONSTRAINT "Bidder_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "AuctionLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "Bidder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- launchpad-apps/234-auction-app.md (WO-234.1) — the Auction app's admin
-- foundation: an auction, its lots, and the lifecycle states both move
-- through. Bids, bidders, proxy maxima, deposits, results and adjustments
-- are added by the work orders that first use them. Additive only.

-- CreateEnum
CREATE TYPE "AuctionType" AS ENUM ('ENGLISH', 'SEALED_BID', 'REVERSE');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'OPEN', 'CLOSING', 'CLOSED', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuctionLotStatus" AS ENUM ('PENDING', 'OPEN', 'CLOSED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "organizationId" TEXT,
    "outletLocationId" TEXT,
    "type" "AuctionType" NOT NULL DEFAULT 'ENGLISH',
    "title" TEXT NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "terms" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionLot" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "lotNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "startPriceMinor" INTEGER NOT NULL,
    "reservePriceMinor" INTEGER,
    "status" "AuctionLotStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuctionLot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Auction_number_key" ON "Auction"("number");

-- CreateIndex
CREATE INDEX "Auction_status_startsAt_idx" ON "Auction"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Auction_organizationId_idx" ON "Auction"("organizationId");

-- CreateIndex
CREATE INDEX "Auction_outletLocationId_idx" ON "Auction"("outletLocationId");

-- CreateIndex
CREATE INDEX "AuctionLot_auctionId_status_idx" ON "AuctionLot"("auctionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionLot_auctionId_lotNo_key" ON "AuctionLot"("auctionId", "lotNo");

-- AddForeignKey
ALTER TABLE "AuctionLot" ADD CONSTRAINT "AuctionLot_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

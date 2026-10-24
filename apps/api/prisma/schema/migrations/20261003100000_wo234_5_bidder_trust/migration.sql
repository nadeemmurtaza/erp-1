-- launchpad-apps/234-auction-app.md (WO-234.5) — bidder registration, approval
-- and strikes. Additive only: one enum value, one enum, one column on Auction,
-- five nullable columns on Bidder, one table, three indexes.
--
-- The new value goes first and is not used in this script, so the migration is
-- valid inside the transaction PostgreSQL wraps around it.

-- AlterEnum: a refused registration is not a suspension
ALTER TYPE "BidderStatus" ADD VALUE 'DECLINED';

-- CreateEnum
CREATE TYPE "AuctionRegistration" AS ENUM ('OPEN', 'VERIFIED', 'APPROVAL');

-- AlterTable: how the auction vets who may bid. OPEN is the rule every auction
-- that exists today ran under, so no existing auction changes behaviour.
ALTER TABLE "Auction"
    ADD COLUMN "registration" "AuctionRegistration" NOT NULL DEFAULT 'OPEN';

-- AlterTable: who last decided on a bidder and why, and the bidder's open appeal
ALTER TABLE "Bidder"
    ADD COLUMN "decidedById" TEXT,
    ADD COLUMN "decidedAt" TIMESTAMP(3),
    ADD COLUMN "decisionReason" TEXT,
    ADD COLUMN "appealText" TEXT,
    ADD COLUMN "appealedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BidderStrike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "lotId" TEXT,
    "reason" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "BidderStrike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: the staff queue, one auction's bidders by status, oldest first
CREATE INDEX "Bidder_auctionId_status_createdAt_idx" ON "Bidder"("auctionId", "status", "createdAt");

-- CreateIndex: the rolling-window count for one person
CREATE INDEX "BidderStrike_userId_recordedAt_idx" ON "BidderStrike"("userId", "recordedAt");

-- CreateIndex: a bidder's own strikes
CREATE INDEX "BidderStrike_bidderId_idx" ON "BidderStrike"("bidderId");

-- AddForeignKey
ALTER TABLE "BidderStrike" ADD CONSTRAINT "BidderStrike_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "Bidder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

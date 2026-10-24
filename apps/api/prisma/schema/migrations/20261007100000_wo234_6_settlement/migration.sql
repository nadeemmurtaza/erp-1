-- launchpad-apps/234-auction-app.md (WO-234.6) — settlement: what a winning lot
-- owes and whether it was paid. Additive only: one enum, two tables, one column
-- on "BidderStrike" made nullable, one column added to it, and their indexes.
--
-- "BidderStrike"."recordedById" becomes nullable because the system now records
-- a strike itself when a payment window passes; "settlementId" names the
-- settlement that caused it and is unique, so a retried sweep cannot strike a
-- person twice for one unpaid win. Dropping a NOT NULL never rewrites rows.

-- CreateEnum
CREATE TYPE "AuctionSettlementStatus" AS ENUM ('INVOICING', 'INVOICE_FAILED', 'AWAITING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED');

-- AlterTable: a strike the system recorded has no staff author
ALTER TABLE "BidderStrike" ALTER COLUMN "recordedById" DROP NOT NULL;
ALTER TABLE "BidderStrike" ADD COLUMN "settlementId" TEXT;

-- CreateTable
CREATE TABLE "AuctionSettlement" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "AuctionSettlementStatus" NOT NULL DEFAULT 'INVOICING',
    "currency" TEXT NOT NULL,
    "hammerMinor" BIGINT NOT NULL,
    "premiumBps" INTEGER NOT NULL DEFAULT 0,
    "premiumMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL,
    "paidMinor" BIGINT NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT,
    "orderNumber" TEXT,
    "failureReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuctionSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionSettlementPayment" (
    "paymentId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionSettlementPayment_pkey" PRIMARY KEY ("paymentId")
);

-- CreateIndex: at most one strike per settlement
CREATE UNIQUE INDEX "BidderStrike_settlementId_key" ON "BidderStrike"("settlementId");

-- CreateIndex: one settlement per lot per offer — the second-copy guard
CREATE UNIQUE INDEX "AuctionSettlement_lotId_attempt_key" ON "AuctionSettlement"("lotId", "attempt");

-- CreateIndex: the staff list
CREATE INDEX "AuctionSettlement_auctionId_status_createdAt_idx" ON "AuctionSettlement"("auctionId", "status", "createdAt");

-- CreateIndex: the sweep — what is due, and what is stuck invoicing
CREATE INDEX "AuctionSettlement_status_dueAt_idx" ON "AuctionSettlement"("status", "dueAt");

-- CreateIndex: a payment or a cancellation finds its settlement by order
CREATE INDEX "AuctionSettlement_orderId_idx" ON "AuctionSettlement"("orderId");

-- CreateIndex: a settlement's payments
CREATE INDEX "AuctionSettlementPayment_settlementId_idx" ON "AuctionSettlementPayment"("settlementId");

-- AddForeignKey
ALTER TABLE "AuctionSettlement" ADD CONSTRAINT "AuctionSettlement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "AuctionLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionSettlement" ADD CONSTRAINT "AuctionSettlement_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "Bidder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionSettlementPayment" ADD CONSTRAINT "AuctionSettlementPayment_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "AuctionSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

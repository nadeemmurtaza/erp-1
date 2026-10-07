-- integrations-connectivity/213-partner-fact-exchange.md, WO-213.1 (ADR-087).
-- Additive only: one enum, one table, two nullable columns on TradingPartner.
-- No column is dropped, no row is deleted, no existing row is rewritten.
--
-- Why: a connected partner's fact ("I dispatched these goods to you") is
-- stored first and applied second, so acknowledging it never depends on
-- purchasing being present. The unique (tradingPartnerId, factId) makes the
-- sender's retry of the same fact a no-op by constraint.
--
--   TradingPartner.inboundKeyExpiresAt        null = never expires. Every key
--     issued before this migration keeps working exactly as it does today.
--   TradingPartner.inboundKeyRotatedByUserId  null = issued before this column.
--
-- The FK is ON DELETE RESTRICT, deliberately: a received fact is an audit
-- record, so deleting a partner that has sent facts is refused (the service
-- answers 409) instead of silently deleting them.
--
-- The partial index serves the operator queue (RECEIVED / NEEDS_REVIEW), a
-- tiny fraction of a table that grows by every fact ever received. Prisma
-- cannot express a partial index, so it exists here only; `prisma migrate
-- diff` against a database that has it will want to drop it, which is one more
-- reason this repository never runs that against a real database.

-- CreateEnum
CREATE TYPE "PartnerFactStatus" AS ENUM ('RECEIVED', 'APPLIED', 'NEEDS_REVIEW', 'REJECTED');

-- AlterTable
ALTER TABLE "TradingPartner" ADD COLUMN "inboundKeyExpiresAt" TIMESTAMP(3);
ALTER TABLE "TradingPartner" ADD COLUMN "inboundKeyRotatedByUserId" TEXT;

-- CreateTable
CREATE TABLE "PartnerFactInbox" (
    "id" TEXT NOT NULL,
    "tradingPartnerId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "documentRef" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB,
    "status" "PartnerFactStatus" NOT NULL DEFAULT 'RECEIVED',
    "statusReason" TEXT,
    "appliedPurchaseOrderId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerFactInbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerFactInbox_tradingPartnerId_factId_key" ON "PartnerFactInbox"("tradingPartnerId", "factId");

-- CreateIndex
CREATE INDEX "PartnerFactInbox_tradingPartnerId_receivedAt_idx" ON "PartnerFactInbox"("tradingPartnerId", "receivedAt");

-- CreateIndex (partial — migration only, see the header)
CREATE INDEX "PartnerFactInbox_open_receivedAt_idx" ON "PartnerFactInbox"("receivedAt") WHERE "status" IN ('RECEIVED', 'NEEDS_REVIEW');

-- AddForeignKey
ALTER TABLE "PartnerFactInbox" ADD CONSTRAINT "PartnerFactInbox_tradingPartnerId_fkey" FOREIGN KEY ("tradingPartnerId") REFERENCES "TradingPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- integrations-connectivity/213-partner-fact-exchange.md, WO-213.2 (ADR-087).
-- Additive only: one nullable column and its unique index on PurchaseOrder.
-- No column is dropped, no row is deleted or rewritten; every existing order
-- keeps NULL, which means "raised by a person, or from a requisition".
--
-- Why: a partner's sale.dispatched fact creates a purchase order on the buyer.
-- Facts are delivered at least once, so creating the order a second time for
-- the same fact must fail by constraint. Postgres allows many NULLs in a unique
-- index, so orders not made from a fact are unaffected. The column is a bare
-- scalar (no foreign key to PartnerFactInbox): purchasing stays decoupled from
-- the trading-partner module.

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN "sourceFactInboxId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_sourceFactInboxId_key" ON "PurchaseOrder"("sourceFactInboxId");

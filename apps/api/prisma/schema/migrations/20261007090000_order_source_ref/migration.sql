-- launchpad-apps/234-auction-app.md (WO-234.6) — where an order came from.
-- Additive only: two nullable columns on "Order" and one unique index. Every
-- existing order is a checkout or a point-of-sale order and keeps both null, so
-- nothing about an existing row or query changes.
--
-- The pair is unique together so that asking for the same thing twice (an
-- auction settlement retried after a crash) yields the first order and never a
-- second. PostgreSQL treats two NULLs as distinct in a unique index, so the
-- many orders with no source do not collide.

-- AlterTable
ALTER TABLE "Order"
    ADD COLUMN "sourceType" TEXT,
    ADD COLUMN "sourceRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_sourceType_sourceRef_key" ON "Order"("sourceType", "sourceRef");

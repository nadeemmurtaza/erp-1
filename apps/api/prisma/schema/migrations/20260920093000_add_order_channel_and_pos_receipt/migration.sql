-- RETAIL-ERP.md R11: a till sale is a CHANNEL of `orders`, not a parallel
-- order system. These are the additive scalar columns that make that true,
-- plus the receipt row WO-21.5 writes after a till sale.
--
-- channel is NOT NULL DEFAULT 'WEB' so every order already in the table is
-- correctly labelled by the migration itself — every existing row predates the
-- till and was placed on the web, so the default is the right answer for all
-- of them rather than a placeholder.
--
-- locationId, terminalId, shiftId and originNodeId are bare scalars, not
-- foreign keys: `pos` and `organization` are separate modules from `orders`
-- (the module-boundary rule), and a cross-module FK is exactly the coupling
-- that rule exists to prevent. They are null for every WEB order.
--
-- PosReceipt.orderId is likewise a bare scalar, UNIQUE — one receipt per
-- order, with reprints tracked by incrementing printCount rather than
-- inserting another row.

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('WEB', 'POS');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "channel" "OrderChannel" NOT NULL DEFAULT 'WEB',
ADD COLUMN     "locationId" TEXT,
ADD COLUMN     "terminalId" TEXT,
ADD COLUMN     "shiftId" TEXT,
ADD COLUMN     "originNodeId" TEXT;

-- CreateIndex
CREATE INDEX "Order_channel_idx" ON "Order"("channel");

-- CreateIndex
CREATE INDEX "Order_shiftId_idx" ON "Order"("shiftId");

-- CreateTable
CREATE TABLE "PosReceipt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "printCount" INTEGER NOT NULL DEFAULT 0,
    "printedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosReceipt_orderId_key" ON "PosReceipt"("orderId");

-- CreateIndex
CREATE INDEX "PosReceipt_orderId_idx" ON "PosReceipt"("orderId");

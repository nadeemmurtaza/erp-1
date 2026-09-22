-- WO-23.1's WO-B.3: contribution per order, a derived reporting snapshot
-- (10-admin-dashboard.md WO-B.3, 04-finance.md WO-4.2). Not a GL posting —
-- order revenue/COGS already post to the ledger at OrderPlaced time
-- (posting-rules.subscriber.ts's onOrderPlaced) — this table only saves
-- unit-economics reports from recomputing across the order tree on every
-- read.
--
-- orderId is the primary key on purpose: one row per order, overwritten in
-- place on recompute (DELIVERED, then again if later RETURNED), never a log
-- of recomputations.

-- CreateTable
CREATE TABLE "OrderEconomics" (
    "orderId" TEXT NOT NULL,
    "revenue" INTEGER NOT NULL,
    "shippingIncome" INTEGER NOT NULL,
    "codFeeIncome" INTEGER NOT NULL,
    "cogs" INTEGER NOT NULL,
    "shippingCost" INTEGER NOT NULL,
    "shippingCostEstimated" BOOLEAN NOT NULL DEFAULT false,
    "gatewayFee" INTEGER NOT NULL,
    "packagingCost" INTEGER NOT NULL,
    "contribution" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEconomics_pkey" PRIMARY KEY ("orderId")
);

-- AddForeignKey
ALTER TABLE "OrderEconomics" ADD CONSTRAINT "OrderEconomics_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

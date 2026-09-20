-- Inter-branch stock transfers (RETAIL-ERP.md R4, WO-22.1).
--
-- sourceLocationId, destinationLocationId and inTransitLocationId are bare
-- scalars rather than foreign keys: `inventory` owns Location and is a
-- different module from `transfers`, the same no-cross-module-Prisma-coupling
-- choice PosTerminal.locationId and Order.locationId already made.
-- TransfersService checks they exist at write time and owns the in-transit
-- Location's whole lifecycle.
--
-- StockTransferLine.transferId IS a foreign key, with ON DELETE CASCADE: a
-- line has no meaning without its transfer and both live in this module.
--
-- TransferNumberCounter has the same shape as OrderNumberCounter — an
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING against a counter row, which
-- sidesteps the read-then-write race a MAX(number)+1 would have under
-- concurrent dispatches.

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('IN_TRANSIT', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "sourceLocationId" TEXT NOT NULL,
    "destinationLocationId" TEXT NOT NULL,
    "inTransitLocationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "receivedByUserId" TEXT,
    "note" TEXT,
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferLine" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantityDispatched" INTEGER NOT NULL,
    "quantityReceived" INTEGER,

    CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferNumberCounter" (
    "year" INTEGER NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TransferNumberCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_number_key" ON "StockTransfer"("number");

-- CreateIndex
CREATE INDEX "StockTransfer_status_idx" ON "StockTransfer"("status");

-- CreateIndex
CREATE INDEX "StockTransfer_sourceLocationId_idx" ON "StockTransfer"("sourceLocationId");

-- CreateIndex
CREATE INDEX "StockTransfer_destinationLocationId_idx" ON "StockTransfer"("destinationLocationId");

-- CreateIndex
CREATE INDEX "StockTransferLine_transferId_idx" ON "StockTransferLine"("transferId");

-- CreateIndex
CREATE INDEX "StockTransferLine_variantId_idx" ON "StockTransferLine"("variantId");

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

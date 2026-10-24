-- WO-22.3: how a transfer between two brands is settled, and the invoice that
-- records it (RETAIL-ERP.md R12, R17).
--
-- settlementMode is NOT NULL DEFAULT 'NONE' because every transfer already in
-- the table is an intra-brand move, which is exactly what NONE means — the
-- default is the correct answer for existing rows rather than a placeholder,
-- and the column is resolved once at dispatch and never changed afterwards.
--
-- InterBranchInvoice.transferId is UNIQUE, not merely indexed: R12 gives one
-- invoice per invoiced transfer, and a unique constraint is what makes that a
-- guarantee rather than a convention the service has to remember. It cascades
-- on delete because the invoice has no meaning without its transfer and both
-- live in this module.
--
-- sourceRetailBrandId and destinationRetailBrandId are bare scalars with no
-- foreign key: RetailBrand lives in organization.prisma, a different module's
-- schema file, and at chain scale the two rows can be in different databases
-- (ADR-009, ADR-012). Location.retailBrandId already set that convention.
--
-- amountMinor is integer paisa like every other amount here (House Rule 5),
-- and carries no markup — R12 fixes the transfer price at weighted-average
-- cost, which is what lets the posting rule's Revenue/COGS pair net to zero
-- group-wide on consolidation (R17).
--
-- InterBranchInvoiceNumberCounter repeats the counter-row shape that
-- OrderNumberCounter and TransferNumberCounter already use: an
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING against a single row avoids
-- the read-then-write race a MAX(number)+1 would have under concurrent issues.

-- CreateEnum
CREATE TYPE "SettlementMode" AS ENUM ('NONE', 'INTERNAL_PL', 'INVOICED');

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN     "settlementMode" "SettlementMode" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "StockTransferLine" ADD COLUMN     "unitCost" INTEGER;

-- CreateTable
CREATE TABLE "InterBranchInvoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "sourceRetailBrandId" TEXT NOT NULL,
    "destinationRetailBrandId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterBranchInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterBranchInvoiceNumberCounter" (
    "year" INTEGER NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InterBranchInvoiceNumberCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterBranchInvoice_number_key" ON "InterBranchInvoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "InterBranchInvoice_transferId_key" ON "InterBranchInvoice"("transferId");

-- CreateIndex
CREATE INDEX "InterBranchInvoice_sourceRetailBrandId_idx" ON "InterBranchInvoice"("sourceRetailBrandId");

-- CreateIndex
CREATE INDEX "InterBranchInvoice_destinationRetailBrandId_idx" ON "InterBranchInvoice"("destinationRetailBrandId");

-- AddForeignKey
ALTER TABLE "InterBranchInvoice" ADD CONSTRAINT "InterBranchInvoice_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

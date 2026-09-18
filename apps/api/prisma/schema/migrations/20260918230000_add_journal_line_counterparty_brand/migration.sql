-- AlterTable
ALTER TABLE "JournalLine" ADD COLUMN     "counterpartyBrandId" TEXT;

-- CreateIndex
CREATE INDEX "JournalLine_counterpartyBrandId_idx" ON "JournalLine"("counterpartyBrandId");

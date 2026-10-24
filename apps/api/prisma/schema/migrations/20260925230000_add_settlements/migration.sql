-- finance-accounting/49-financial-institution-settlement-partnerships.md
-- (WO-49.1) — reconciling what a bank/gateway actually paid out against
-- what Payment already records as owed. Additive only.

-- CreateEnum
CREATE TYPE "SettlementBatchStatus" AS ENUM ('EXPECTED', 'CONFIRMED', 'SHORT', 'DISPUTED');

-- CreateTable
CREATE TABLE "SettlementProvider" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SettlementProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementBatch" (
    "id" TEXT NOT NULL,
    "settlementProviderId" TEXT NOT NULL,
    "externalBatchRef" TEXT NOT NULL,
    "expectedAmountMinor" INTEGER NOT NULL,
    "settledAmountMinor" INTEGER,
    "status" "SettlementBatchStatus" NOT NULL DEFAULT 'EXPECTED',
    "settledAt" TIMESTAMP(3),
    "writtenOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementBatchLine" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,

    CONSTRAINT "SettlementBatchLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SettlementProvider_key_key" ON "SettlementProvider"("key");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementBatch_settlementProviderId_externalBatchRef_key" ON "SettlementBatch"("settlementProviderId", "externalBatchRef");

-- CreateIndex
CREATE INDEX "SettlementBatch_status_idx" ON "SettlementBatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementBatchLine_batchId_paymentId_key" ON "SettlementBatchLine"("batchId", "paymentId");

-- AddForeignKey
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_settlementProviderId_fkey" FOREIGN KEY ("settlementProviderId") REFERENCES "SettlementProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatchLine" ADD CONSTRAINT "SettlementBatchLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SettlementBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatchLine" ADD CONSTRAINT "SettlementBatchLine_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

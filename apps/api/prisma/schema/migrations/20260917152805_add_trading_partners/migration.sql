-- CreateEnum
CREATE TYPE "TradingPartnerKind" AS ENUM ('SUPPLIER', 'CUSTOMER', 'BOTH');

-- CreateEnum
CREATE TYPE "TradingPartnerStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "tradingPartnerId" TEXT;

-- CreateTable
CREATE TABLE "TradingPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TradingPartnerKind" NOT NULL,
    "outboundBaseUrl" TEXT,
    "outboundApiKeyEncrypted" TEXT,
    "inboundApiKeyHash" TEXT,
    "status" "TradingPartnerStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingPartner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradingPartner_inboundApiKeyHash_key" ON "TradingPartner"("inboundApiKeyHash");

-- CreateIndex
CREATE INDEX "TradingPartner_status_idx" ON "TradingPartner"("status");

-- CreateIndex
CREATE INDEX "Supplier_tradingPartnerId_idx" ON "Supplier"("tradingPartnerId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_tradingPartnerId_fkey" FOREIGN KEY ("tradingPartnerId") REFERENCES "TradingPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

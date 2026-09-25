-- WO-155.1 (docs/implementation/commercial-licensing-agency/155-wallet-stored-value-merchant-escrow.md)
--
-- Additive only. Newax-issued store credit (WalletAccount/WalletEntry,
-- append-only), its own above-threshold approval request
-- (WalletAdjustmentRequest, reusing the existing generic ApprovalChain
-- engine via a new ApprovalSubjectType value), and a merchant's own
-- ordinary trade payable (MerchantPayable) — never a per-merchant escrow
-- balance. See wallet.prisma's own header comment for why the structure is
-- shaped this way.
--
-- Ships module-off (WalletModule is registered in modules.registry.ts but
-- enabled in no deployment's MODULES today) — this migration exists so the
-- schema, services and tests are real and verified, pending WO-155.0's own
-- legal confirmation (see DECISIONS.md).

-- CreateEnum
CREATE TYPE "WalletEntryType" AS ENUM ('PURCHASE', 'RESERVE', 'REDEEM', 'RELEASE_RESERVATION', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "WalletAccountStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "WalletAdjustmentRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MerchantPayableStatus" AS ENUM ('OPEN', 'SCHEDULED', 'PAID', 'DISPUTED');

-- AlterEnum
ALTER TYPE "ApprovalSubjectType" ADD VALUE 'WALLET_ADJUSTMENT';

-- CreateTable
CREATE TABLE "WalletAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "customerId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "status" "WalletAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "WalletEntryType" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "orderId" TEXT,
    "sourceRef" TEXT NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletAdjustmentRequest" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" "WalletAdjustmentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "walletEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "WalletAdjustmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantPayable" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "grossMinor" INTEGER NOT NULL,
    "platformFeeMinor" INTEGER NOT NULL,
    "netPayableMinor" INTEGER NOT NULL,
    "status" "MerchantPayableStatus" NOT NULL DEFAULT 'OPEN',
    "scheduledPayoutAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "disputedByUserId" TEXT,
    "disputeReason" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantPayable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_customerId_key" ON "WalletAccount"("customerId");

-- CreateIndex
CREATE INDEX "WalletAccount_organizationId_idx" ON "WalletAccount"("organizationId");

-- CreateIndex
CREATE INDEX "WalletEntry_accountId_createdAt_idx" ON "WalletEntry"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletEntry_accountId_type_sourceRef_key" ON "WalletEntry"("accountId", "type", "sourceRef");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAdjustmentRequest_walletEntryId_key" ON "WalletAdjustmentRequest"("walletEntryId");

-- CreateIndex
CREATE INDEX "WalletAdjustmentRequest_accountId_status_idx" ON "WalletAdjustmentRequest"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantPayable_orderId_key" ON "MerchantPayable"("orderId");

-- CreateIndex
CREATE INDEX "MerchantPayable_organizationId_status_idx" ON "MerchantPayable"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WalletAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAdjustmentRequest" ADD CONSTRAINT "WalletAdjustmentRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WalletAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

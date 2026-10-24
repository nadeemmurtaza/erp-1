-- CreateEnum
CREATE TYPE "B2BOrderRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CONVERTED');

-- AlterEnum
ALTER TYPE "ApprovalSubjectType" ADD VALUE 'B2B_ORDER';

-- AlterTable
ALTER TABLE "ApprovalStep" ADD COLUMN     "approverContactIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "decidedByContactId" TEXT;

-- CreateTable
CREATE TABLE "B2BAccount" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresPurchaseOrder" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2BAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2BPurchaseApprovalPolicy" (
    "id" TEXT NOT NULL,
    "b2bAccountId" TEXT NOT NULL,
    "thresholdMinor" INTEGER NOT NULL,
    "approverContactIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2BPurchaseApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2BOrderRequest" (
    "id" TEXT NOT NULL,
    "b2bAccountId" TEXT NOT NULL,
    "requestedByContactId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "cartToken" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "paymentDto" JSONB NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "status" "B2BOrderRequestStatus" NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT,
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2BOrderRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "B2BAccount_customerId_key" ON "B2BAccount"("customerId");

-- CreateIndex
CREATE INDEX "B2BAccount_isActive_idx" ON "B2BAccount"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "B2BPurchaseApprovalPolicy_b2bAccountId_key" ON "B2BPurchaseApprovalPolicy"("b2bAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "B2BOrderRequest_orderId_key" ON "B2BOrderRequest"("orderId");

-- CreateIndex
CREATE INDEX "B2BOrderRequest_b2bAccountId_status_idx" ON "B2BOrderRequest"("b2bAccountId", "status");

-- AddForeignKey
ALTER TABLE "B2BPurchaseApprovalPolicy" ADD CONSTRAINT "B2BPurchaseApprovalPolicy_b2bAccountId_fkey" FOREIGN KEY ("b2bAccountId") REFERENCES "B2BAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2BOrderRequest" ADD CONSTRAINT "B2BOrderRequest_b2bAccountId_fkey" FOREIGN KEY ("b2bAccountId") REFERENCES "B2BAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

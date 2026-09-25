-- WO-152 (docs/implementation/inventory-purchasing/152-purchase-requisition.md)
-- and WO-156 (docs/implementation/inventory-purchasing/156-single-employee-branch-loss-prevention.md).
--
-- Additive only. Three independent pieces:
--   1. A generic approval chain (ApprovalChain/ApprovalStep), referenced by
--      (subjectType, subjectId) rather than a bespoke chain per feature —
--      doc 63's own shape, scoped here to PURCHASE_REQUISITION, the one
--      consumer that exists today.
--   2. PurchaseRequisition/RequisitionLine — a request to buy, distinct from
--      the PurchaseOrder that results once approved.
--   3. StockVariance.posShiftId + SpotCheckPolicy/SpotCheck/SpotCheckLine —
--      shift-attributed shrinkage accountability and unpredictable spot
--      counts for single-employee branches.

-- CreateEnum
CREATE TYPE "ApprovalSubjectType" AS ENUM ('PURCHASE_REQUISITION');

-- CreateEnum
CREATE TYPE "ApprovalChainStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalStepStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "RequisitionApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "SpotCheckStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "StockVariance" ADD COLUMN "posShiftId" TEXT;

-- CreateTable
CREATE TABLE "ApprovalChain" (
    "id" TEXT NOT NULL,
    "subjectType" "ApprovalSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "status" "ApprovalChainStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalChain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "approverRoleId" TEXT,
    "approverUserId" TEXT,
    "status" "ApprovalStepStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "comment" TEXT,

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequisition" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "status" "RequisitionApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "convertedPurchaseOrderId" TEXT,
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitionLine" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "estimatedUnitCostMinor" INTEGER,

    CONSTRAINT "RequisitionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpotCheckPolicy" (
    "id" TEXT NOT NULL,
    "locationId" TEXT,
    "minSkusPerCheck" INTEGER NOT NULL DEFAULT 5,
    "frequencyDays" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpotCheckPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpotCheck" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "status" "SpotCheckStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpotCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpotCheckLine" (
    "id" TEXT NOT NULL,
    "spotCheckId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "expected" INTEGER NOT NULL,
    "counted" INTEGER,
    "variance" INTEGER,

    CONSTRAINT "SpotCheckLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalChain_subjectType_status_idx" ON "ApprovalChain"("subjectType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalChain_subjectType_subjectId_key" ON "ApprovalChain"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "ApprovalStep_approverUserId_status_idx" ON "ApprovalStep"("approverUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_chainId_stepOrder_key" ON "ApprovalStep"("chainId", "stepOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequisition_convertedPurchaseOrderId_key" ON "PurchaseRequisition"("convertedPurchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseRequisition_status_createdAt_idx" ON "PurchaseRequisition"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseRequisition_requestedById_createdAt_idx" ON "PurchaseRequisition"("requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseRequisition_locationId_idx" ON "PurchaseRequisition"("locationId");

-- CreateIndex
CREATE INDEX "RequisitionLine_requisitionId_idx" ON "RequisitionLine"("requisitionId");

-- CreateIndex
CREATE INDEX "RequisitionLine_variantId_idx" ON "RequisitionLine"("variantId");

-- CreateIndex
CREATE INDEX "SpotCheckPolicy_locationId_isActive_idx" ON "SpotCheckPolicy"("locationId", "isActive");

-- CreateIndex
CREATE INDEX "SpotCheck_locationId_status_idx" ON "SpotCheck"("locationId", "status");

-- CreateIndex
CREATE INDEX "SpotCheck_policyId_scheduledFor_idx" ON "SpotCheck"("policyId", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "SpotCheckLine_spotCheckId_variantId_key" ON "SpotCheckLine"("spotCheckId", "variantId");

-- CreateIndex
CREATE INDEX "StockVariance_posShiftId_idx" ON "StockVariance"("posShiftId");

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "ApprovalChain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockVariance" ADD CONSTRAINT "StockVariance_posShiftId_fkey" FOREIGN KEY ("posShiftId") REFERENCES "PosShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_convertedPurchaseOrderId_fkey" FOREIGN KEY ("convertedPurchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionLine" ADD CONSTRAINT "RequisitionLine_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "PurchaseRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionLine" ADD CONSTRAINT "RequisitionLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotCheckPolicy" ADD CONSTRAINT "SpotCheckPolicy_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotCheck" ADD CONSTRAINT "SpotCheck_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SpotCheckPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotCheck" ADD CONSTRAINT "SpotCheck_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotCheckLine" ADD CONSTRAINT "SpotCheckLine_spotCheckId_fkey" FOREIGN KEY ("spotCheckId") REFERENCES "SpotCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotCheckLine" ADD CONSTRAINT "SpotCheckLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

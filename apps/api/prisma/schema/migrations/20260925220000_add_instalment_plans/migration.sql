-- finance-accounting/151-layby-installment-sales.md (WO-151.1) — layby and
-- instalment sales. Additive only. Payment already supports multiple rows
-- per order (Payment.orderId has no unique constraint), so this schema adds
-- no new column to Payment/Order beyond the two back-relations Prisma
-- itself needs no DDL for.

-- CreateEnum
CREATE TYPE "InstalmentPlanType" AS ENUM ('LAYBY', 'INSTALMENT');

-- CreateEnum
CREATE TYPE "InstalmentPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "InstalmentPlan" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "InstalmentPlanType" NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "depositMinor" INTEGER NOT NULL DEFAULT 0,
    "status" "InstalmentPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "defaultedAt" TIMESTAMP(3),

    CONSTRAINT "InstalmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstalmentScheduleLine" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountMinor" INTEGER NOT NULL,

    CONSTRAINT "InstalmentScheduleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstalmentPayment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstalmentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstalmentPlan_orderId_key" ON "InstalmentPlan"("orderId");

-- CreateIndex
CREATE INDEX "InstalmentPlan_status_idx" ON "InstalmentPlan"("status");

-- CreateIndex
CREATE INDEX "InstalmentScheduleLine_planId_dueDate_idx" ON "InstalmentScheduleLine"("planId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "InstalmentPayment_paymentId_key" ON "InstalmentPayment"("paymentId");

-- CreateIndex
CREATE INDEX "InstalmentPayment_planId_idx" ON "InstalmentPayment"("planId");

-- AddForeignKey
ALTER TABLE "InstalmentPlan" ADD CONSTRAINT "InstalmentPlan_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalmentScheduleLine" ADD CONSTRAINT "InstalmentScheduleLine_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstalmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalmentPayment" ADD CONSTRAINT "InstalmentPayment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstalmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalmentPayment" ADD CONSTRAINT "InstalmentPayment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 145-receivables-credit-limits-dunning.md (WO-145.1)
-- CreditNote/DebitNote, customer credit limits/holds and dunning. Additive
-- only — no existing table, column or constraint is touched.

-- CreateEnum
CREATE TYPE "CreditDebitNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'APPLIED', 'VOID');

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "appliedToOrderId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CreditDebitNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebitNote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierBillId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CreditDebitNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCreditTerm" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "creditLimitMinor" INTEGER NOT NULL,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
    "isOnHold" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCreditTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DunningPolicy" (
    "id" TEXT NOT NULL,
    "stepsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DunningPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DunningEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DunningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_number_key" ON "CreditNote"("number");

-- CreateIndex
CREATE INDEX "CreditNote_customerId_status_idx" ON "CreditNote"("customerId", "status");

-- CreateIndex
CREATE INDEX "CreditNote_orderId_idx" ON "CreditNote"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DebitNote_number_key" ON "DebitNote"("number");

-- CreateIndex
CREATE INDEX "DebitNote_supplierId_status_idx" ON "DebitNote"("supplierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCreditTerm_customerId_key" ON "CustomerCreditTerm"("customerId");

-- CreateIndex
CREATE INDEX "CustomerCreditTerm_isOnHold_idx" ON "CustomerCreditTerm"("isOnHold");

-- CreateIndex
CREATE INDEX "DunningEvent_orderId_idx" ON "DunningEvent"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DunningEvent_orderId_stepIndex_key" ON "DunningEvent"("orderId", "stepIndex");

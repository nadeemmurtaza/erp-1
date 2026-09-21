-- WO-23.1: the finance module's first two tables — operational expenses and
-- the categories that classify them (10-admin-dashboard.md WO-B.1, extended
-- by RETAIL-ERP.md Tranche 6 to post to the GL once accounting is on).
--
-- Expense_recurringFromId_recurringPeriod_key is the belt to the recurring-
-- expense cron's (WO-B.2) braces: even if that job runs twice, the database
-- refuses the second rent row for the same period rather than relying on
-- the handler alone being idempotent.
--
-- No foreign key from Expense to Account (accounting.prisma) or to a
-- JournalEntry — the posting this tranche adds is a DERIVED entry the
-- posting-rules.subscriber.ts handler looks up by (source, sourceRef), the
-- same shape order.placed/payment.succeeded already use. An Expense row
-- carries no status column for it.

-- CreateEnum
CREATE TYPE "ExpenseRecurrence" AS ENUM ('NONE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDirect" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "description" TEXT NOT NULL,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "payee" TEXT,
    "supplierId" TEXT,
    "reference" TEXT,
    "receiptUrl" TEXT,
    "recurrence" "ExpenseRecurrence" NOT NULL DEFAULT 'NONE',
    "recurringFromId" TEXT,
    "recurringPeriod" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_key_key" ON "ExpenseCategory"("key");

-- CreateIndex
CREATE INDEX "ExpenseCategory_isActive_order_idx" ON "ExpenseCategory"("isActive", "order");

-- CreateIndex
CREATE INDEX "Expense_incurredAt_idx" ON "Expense"("incurredAt");

-- CreateIndex
CREATE INDEX "Expense_categoryId_incurredAt_idx" ON "Expense"("categoryId", "incurredAt");

-- CreateIndex
CREATE INDEX "Expense_paidAt_idx" ON "Expense"("paidAt");

-- CreateIndex
CREATE INDEX "Expense_supplierId_idx" ON "Expense"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_recurringFromId_recurringPeriod_key" ON "Expense"("recurringFromId", "recurringPeriod");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurringFromId_fkey" FOREIGN KEY ("recurringFromId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

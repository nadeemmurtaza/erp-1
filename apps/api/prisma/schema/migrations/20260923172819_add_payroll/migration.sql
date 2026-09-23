-- WO-19.1 (docs/implementation/19-payroll.md) — the payroll module's
-- foundation tables: wage rates, leave types/balances/requests, and the
-- PayRun/PayRunLine document with its own number counter. No foreign key
-- to Account/JournalEntry here, same reasoning as Expense's own migration
-- comment: GL posting (WO-19.4) is a DERIVED entry the posting-rules
-- subscriber looks up by (source, sourceRef); PayRun itself carries no
-- posting-status column beyond its own DRAFT/APPROVED/POSTED lifecycle.
--
-- PayRunLine_payRunId_userId_key is the same belt-and-braces idea as
-- Expense's recurring-instance uniqueness: even if the pay-run builder
-- runs twice for the same run, the database refuses a second line for the
-- same employee rather than relying on the service alone being idempotent.

-- CreateEnum
CREATE TYPE "CompensationBasis" AS ENUM ('MONTHLY', 'HOURLY', 'COMMISSION');

-- CreateEnum
CREATE TYPE "LeaveKind" AS ENUM ('ANNUAL', 'SICK', 'UNPAID', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayRunStatus" AS ENUM ('DRAFT', 'APPROVED', 'POSTED');

-- CreateEnum
CREATE TYPE "PayRunAdjustmentReason" AS ENUM ('OVERPAYMENT', 'UNDERPAYMENT', 'CORRECTION');

-- CreateTable
CREATE TABLE "CompensationRate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "basis" "CompensationBasis" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompensationRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LeaveKind" NOT NULL,
    "accrualDaysPerRun" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveAccrualRun" (
    "id" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveAccrualRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayRun" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "PayRunStatus" NOT NULL DEFAULT 'DRAFT',
    "scopeLevel" "ScopeLevel" NOT NULL DEFAULT 'BRAND',
    "originNodeId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayRunLine" (
    "id" TEXT NOT NULL,
    "payRunId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "compensationRateId" TEXT NOT NULL,
    "grossMinor" INTEGER NOT NULL,
    "unpaidLeaveDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unpaidLeaveMinor" INTEGER NOT NULL DEFAULT 0,
    "deductions" JSONB NOT NULL,
    "deductionsMinor" INTEGER NOT NULL DEFAULT 0,
    "netMinor" INTEGER NOT NULL,

    CONSTRAINT "PayRunLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayRunAdjustment" (
    "id" TEXT NOT NULL,
    "payRunId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" "PayRunAdjustmentReason" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayRunAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayRunNumberCounter" (
    "year" INTEGER NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PayRunNumberCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE INDEX "CompensationRate_userId_effectiveFrom_idx" ON "CompensationRate"("userId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_key_key" ON "LeaveType"("key");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_userId_leaveTypeId_key" ON "LeaveBalance"("userId", "leaveTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveAccrualRun_leaveTypeId_period_key" ON "LeaveAccrualRun"("leaveTypeId", "period");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_status_idx" ON "LeaveRequest"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayRun_number_key" ON "PayRun"("number");

-- CreateIndex
CREATE INDEX "PayRun_status_periodStart_idx" ON "PayRun"("status", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "PayRunLine_payRunId_userId_key" ON "PayRunLine"("payRunId", "userId");

-- AddForeignKey
ALTER TABLE "CompensationRate" ADD CONSTRAINT "CompensationRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRate" ADD CONSTRAINT "CompensationRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveAccrualRun" ADD CONSTRAINT "LeaveAccrualRun_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRun" ADD CONSTRAINT "PayRun_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRun" ADD CONSTRAINT "PayRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRunLine" ADD CONSTRAINT "PayRunLine_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "PayRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRunLine" ADD CONSTRAINT "PayRunLine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRunLine" ADD CONSTRAINT "PayRunLine_compensationRateId_fkey" FOREIGN KEY ("compensationRateId") REFERENCES "CompensationRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRunAdjustment" ADD CONSTRAINT "PayRunAdjustment_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "PayRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRunAdjustment" ADD CONSTRAINT "PayRunAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRunAdjustment" ADD CONSTRAINT "PayRunAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

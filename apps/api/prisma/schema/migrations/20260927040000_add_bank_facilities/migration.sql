-- finance-accounting/167-bank-facility-management.md (WO-167.1) — the
-- business's own borrowing against a bank facility limit: term loans,
-- running finance, overdrafts, and letter-of-credit/bank-guarantee limits.
-- Additive only.

-- CreateEnum
CREATE TYPE "BankFacilityType" AS ENUM ('TERM_LOAN', 'RUNNING_FINANCE', 'OVERDRAFT', 'LETTER_OF_CREDIT', 'BANK_GUARANTEE');

-- CreateEnum
CREATE TYPE "BankFacilityStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateTable
CREATE TABLE "Bank" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankFacility" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "facilityType" "BankFacilityType" NOT NULL,
    "limitMinor" INTEGER NOT NULL,
    "markupRateBps" INTEGER NOT NULL,
    "isFloatingRate" BOOLEAN NOT NULL DEFAULT false,
    "securityReference" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "status" "BankFacilityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankFacilityDrawdown" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "drawdownDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankFacilityDrawdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankFacilityRepayment" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "principalMinor" INTEGER NOT NULL DEFAULT 0,
    "markupMinor" INTEGER NOT NULL DEFAULT 0,
    "repaymentDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankFacilityRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankFacilityMarkupAccrual" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankFacilityMarkupAccrual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bank_name_key" ON "Bank"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BankFacility_key_key" ON "BankFacility"("key");

-- CreateIndex
CREATE INDEX "BankFacility_status_idx" ON "BankFacility"("status");

-- CreateIndex
CREATE INDEX "BankFacility_maturityDate_idx" ON "BankFacility"("maturityDate");

-- CreateIndex
CREATE UNIQUE INDEX "BankFacilityMarkupAccrual_facilityId_periodStart_key" ON "BankFacilityMarkupAccrual"("facilityId", "periodStart");

-- AddForeignKey
ALTER TABLE "BankFacility" ADD CONSTRAINT "BankFacility_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankFacilityDrawdown" ADD CONSTRAINT "BankFacilityDrawdown_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "BankFacility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankFacilityRepayment" ADD CONSTRAINT "BankFacilityRepayment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "BankFacility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankFacilityMarkupAccrual" ADD CONSTRAINT "BankFacilityMarkupAccrual_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "BankFacility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

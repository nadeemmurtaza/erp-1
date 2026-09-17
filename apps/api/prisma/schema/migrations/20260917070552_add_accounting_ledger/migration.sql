-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FiscalPeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "parentId" TEXT,
    "isIntercompany" BOOLEAN NOT NULL DEFAULT false,
    "isBank" BOOLEAN NOT NULL DEFAULT false,
    "isControl" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalYear" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalPeriod" (
    "id" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "status" "FiscalPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "periodId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'POSTED',
    "reversalOfId" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitMinor" INTEGER NOT NULL DEFAULT 0,
    "creditMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "fxRateScaled" INTEGER NOT NULL DEFAULT 1000000,
    "baseAmountMinor" INTEGER NOT NULL,
    "organizationId" TEXT,
    "retailBrandId" TEXT,
    "branchNodeId" TEXT,
    "costCentreId" TEXT,
    "contactId" TEXT,
    "supplierId" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntryNumberCounter" (
    "fiscalYearId" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JournalEntryNumberCounter_pkey" PRIMARY KEY ("fiscalYearId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE INDEX "Account_type_idx" ON "Account"("type");

-- CreateIndex
CREATE INDEX "Account_parentId_idx" ON "Account"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalYear_name_key" ON "FiscalYear"("name");

-- CreateIndex
CREATE INDEX "FiscalYear_startsOn_idx" ON "FiscalYear"("startsOn");

-- CreateIndex
CREATE INDEX "FiscalPeriod_status_idx" ON "FiscalPeriod"("status");

-- CreateIndex
CREATE INDEX "FiscalPeriod_startsOn_endsOn_idx" ON "FiscalPeriod"("startsOn", "endsOn");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalPeriod_fiscalYearId_name_key" ON "FiscalPeriod"("fiscalYearId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_number_key" ON "JournalEntry"("number");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "JournalEntry_periodId_idx" ON "JournalEntry"("periodId");

-- CreateIndex
CREATE INDEX "JournalEntry_source_sourceRef_idx" ON "JournalEntry"("source", "sourceRef");

-- CreateIndex
CREATE INDEX "JournalEntry_status_idx" ON "JournalEntry"("status");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE INDEX "JournalLine_retailBrandId_idx" ON "JournalLine"("retailBrandId");

-- CreateIndex
CREATE INDEX "JournalLine_branchNodeId_idx" ON "JournalLine"("branchNodeId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalPeriod" ADD CONSTRAINT "FiscalPeriod_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FiscalPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryNumberCounter" ADD CONSTRAINT "JournalEntryNumberCounter_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- R15's three invariants, enforced by the database itself, not merely
-- intended by the application: "an application-only guarantee is one bug
-- away from a corrupt ledger." Prisma's schema DSL cannot express either of
-- these declaratively (a CHECK constraint is per-row; both of these are
-- cross-row or transition rules), so they are hand-written here rather than
-- generated — the one place in this migration that is.
-- ============================================================================

-- Invariant 1: SUM(debitMinor) = SUM(creditMinor) per JournalEntry.
--
-- A DEFERRABLE INITIALLY DEFERRED constraint trigger, not a plain AFTER
-- trigger: a single entry's lines are inserted as several separate rows in
-- one statement (accounting.service.ts's nested `create`), and a plain
-- trigger firing after each individual row would see the entry as
-- unbalanced until the last line lands. Deferring to end-of-transaction
-- means the check runs exactly once, after every line for the affected
-- entry (or entries, on a multi-row statement) has actually been written.
CREATE OR REPLACE FUNCTION check_journal_entry_balanced() RETURNS trigger AS $$
DECLARE
  affected_entry_id TEXT;
  total_debit BIGINT;
  total_credit BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_entry_id := OLD."entryId";
  ELSE
    affected_entry_id := NEW."entryId";
  END IF;

  SELECT COALESCE(SUM("debitMinor"), 0), COALESCE(SUM("creditMinor"), 0)
    INTO total_debit, total_credit
    FROM "JournalLine"
    WHERE "entryId" = affected_entry_id;

  IF total_debit <> total_credit THEN
    RAISE EXCEPTION 'JournalEntry % is not balanced: debit % <> credit %',
      affected_entry_id, total_debit, total_credit
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_line_balance_check
  AFTER INSERT OR UPDATE OR DELETE ON "JournalLine"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION check_journal_entry_balanced();

-- Invariant 2a: a JournalLine, once written, is never updated or deleted.
-- No exception, unlike JournalEntry below — a line has no valid mutation at
-- all; a correction is an entirely new JournalEntry (reverseEntry()).
CREATE OR REPLACE FUNCTION forbid_journal_line_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'JournalLine rows are immutable — post a reversing JournalEntry instead of changing %', OLD.id
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_line_immutable
  BEFORE UPDATE OR DELETE ON "JournalLine"
  FOR EACH ROW
  EXECUTE FUNCTION forbid_journal_line_mutation();

-- Invariant 2b: a JournalEntry is immutable except the single
-- POSTED -> REVERSED transition on `status` (reverseEntry()'s last write) —
-- every other column, and every other transition, is refused. A DELETE is
-- always refused.
CREATE OR REPLACE FUNCTION forbid_journal_entry_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'JournalEntry rows are immutable — cannot delete %', OLD.id
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'POSTED' AND NEW.status = 'REVERSED'
     AND OLD.number = NEW.number
     AND OLD.date = NEW.date
     AND OLD."periodId" = NEW."periodId"
     AND OLD.source = NEW.source
     AND OLD."sourceRef" IS NOT DISTINCT FROM NEW."sourceRef"
     AND OLD."reversalOfId" IS NOT DISTINCT FROM NEW."reversalOfId"
     AND OLD.memo IS NOT DISTINCT FROM NEW.memo
     AND OLD."createdAt" = NEW."createdAt"
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'JournalEntry rows are immutable except the POSTED -> REVERSED status transition — post a reversing entry instead of changing %', OLD.id
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entry_immutable
  BEFORE UPDATE OR DELETE ON "JournalEntry"
  FOR EACH ROW
  EXECUTE FUNCTION forbid_journal_entry_mutation();

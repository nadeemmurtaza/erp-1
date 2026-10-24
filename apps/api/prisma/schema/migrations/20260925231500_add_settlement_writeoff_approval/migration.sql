-- finance-accounting/49-financial-institution-settlement-partnerships.md —
-- the maker-checker pair for a SHORT batch's write-off, the identical shape
-- CreditNotesService.issue() already establishes. Additive; the
-- already-applied 20260925230000_add_settlements migration is never edited.

-- AlterTable
ALTER TABLE "SettlementBatch" ADD COLUMN "writeoffRequestedById" TEXT;
ALTER TABLE "SettlementBatch" ADD COLUMN "writeoffApprovedById" TEXT;
ALTER TABLE "SettlementBatch" ADD COLUMN "writeoffNote" TEXT;

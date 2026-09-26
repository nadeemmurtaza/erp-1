-- finance-accounting/151-layby-installment-sales.md — marks which
-- InstalmentPayment is the deposit collected at plan creation, the one
-- payment InstalmentPlanService.cancel()'s deposit-forfeiture Setting can
-- ever apply to. Additive, forward-only: the already-applied
-- 20260925220000_add_instalment_plans migration is never edited.

-- AlterTable
ALTER TABLE "InstalmentPayment" ADD COLUMN "isDeposit" BOOLEAN NOT NULL DEFAULT false;

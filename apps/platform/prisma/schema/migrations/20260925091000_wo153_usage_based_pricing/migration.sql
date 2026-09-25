-- WO-153.1 (docs/implementation/commercial-licensing-agency/
-- 153-usage-based-pricing-model.md) — a fourth PricingModel, USAGE_BASED:
-- the transaction-fee / rate-card / banded-allowance fields on
-- PlatformPlan, the USAGE_BASED-only snapshot + due-date/dunning columns
-- on PlatformInvoice, and the metering ledger itself (UsageMeter, the
-- per-order reversal document MeteredOrderFee, the per-tenant outbox-poll
-- checkpoint UsageMeteringCursor) plus the rate-card create/approve split
-- (PlatformRateCardChangeRequest). See ADR-037 for the architecture this
-- migration supports: metering reads a tenant's own OutboxEvent table
-- through the same connection-per-call mechanism SeatCounterService
-- already uses — no new actor/credential is introduced anywhere here.

-- AlterEnum: PricingModel — the new value is not referenced anywhere else
-- in this same migration transaction, which is what PostgreSQL 12+ allows.
ALTER TYPE "PricingModel" ADD VALUE 'USAGE_BASED';

-- AlterTable: PlatformPlan — USAGE_BASED-only fields, nullable for every
-- other pricing model exactly like the three existing shapes' own fields.
ALTER TABLE "PlatformPlan" ADD COLUMN "transactionFeeBps" INTEGER;
ALTER TABLE "PlatformPlan" ADD COLUMN "usageRateCardMinor" JSONB;
ALTER TABLE "PlatformPlan" ADD COLUMN "includedAllowances" JSONB;

-- AlterTable: PlatformInvoice — USAGE_BASED-only snapshot columns, plus
-- dueAt/dunningReminderSentAt which apply to every pricing model (a real
-- due date is meaningful AR modeling regardless of shape; see ADR-037).
ALTER TABLE "PlatformInvoice" ADD COLUMN "transactionFeeMinorSnapshot" INTEGER;
ALTER TABLE "PlatformInvoice" ADD COLUMN "usageRateCardSnapshot" JSONB;
ALTER TABLE "PlatformInvoice" ADD COLUMN "usageLinesSnapshot" JSONB;
ALTER TABLE "PlatformInvoice" ADD COLUMN "dueAt" TIMESTAMP(3);
ALTER TABLE "PlatformInvoice" ADD COLUMN "dunningReminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PlatformInvoice_status_dueAt_idx" ON "PlatformInvoice"("status", "dueAt");

-- CreateTable: UsageMeter — one row per (tenant, metric, billing period).
CREATE TABLE "UsageMeter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageMeter_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MeteredOrderFee — the reversal document, not a reversal
-- flag: one row per order actually metered for the transaction fee.
CREATE TABLE "MeteredOrderFee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "feeMinor" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "meteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversalCreditNoteId" TEXT,

    CONSTRAINT "MeteredOrderFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UsageMeteringCursor — the per-tenant outbox-poll checkpoint.
CREATE TABLE "UsageMeteringCursor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lastEventId" TEXT,
    "lastEventCreatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageMeteringCursor_pkey" PRIMARY KEY ("id")
);

-- CreateEnum
CREATE TYPE "RateCardChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateTable: PlatformRateCardChangeRequest — the same create/approve
-- split doc 50's own PlatformCustomQuote already established, reused here
-- for a rate-card change above PLATFORM_RATE_CARD_APPROVAL_THRESHOLD_BPS.
CREATE TABLE "PlatformRateCardChangeRequest" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "proposedTransactionFeeBps" INTEGER,
    "proposedUsageRateCardMinor" JSONB,
    "proposedIncludedAllowances" JSONB,
    "requiresApproval" BOOLEAN NOT NULL,
    "status" "RateCardChangeStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByOpsClientId" TEXT NOT NULL,
    "approvedByOpsClientId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformRateCardChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsageMeter_tenantId_metric_periodStart_key" ON "UsageMeter"("tenantId", "metric", "periodStart");
CREATE INDEX "UsageMeter_tenantId_periodStart_idx" ON "UsageMeter"("tenantId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "MeteredOrderFee_tenantId_orderId_key" ON "MeteredOrderFee"("tenantId", "orderId");
CREATE INDEX "MeteredOrderFee_tenantId_periodStart_idx" ON "MeteredOrderFee"("tenantId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "UsageMeteringCursor_tenantId_key" ON "UsageMeteringCursor"("tenantId");

-- CreateIndex
CREATE INDEX "PlatformRateCardChangeRequest_planId_idx" ON "PlatformRateCardChangeRequest"("planId");
CREATE INDEX "PlatformRateCardChangeRequest_status_idx" ON "PlatformRateCardChangeRequest"("status");

-- AddForeignKey
ALTER TABLE "UsageMeter" ADD CONSTRAINT "UsageMeter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeteredOrderFee" ADD CONSTRAINT "MeteredOrderFee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageMeteringCursor" ADD CONSTRAINT "UsageMeteringCursor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformRateCardChangeRequest" ADD CONSTRAINT "PlatformRateCardChangeRequest_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

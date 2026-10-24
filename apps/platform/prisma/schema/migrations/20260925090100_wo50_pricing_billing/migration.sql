-- WO-50.1 / WO-50.3 / WO-50.4 (docs/implementation/commercial-licensing-agency/
-- 50-commercial-pricing-licensing-models.md) — three real commercial
-- shapes on PlatformPlan, the invoice this control plane issues per tenant
-- per billing period (every price snapshotted onto the row at issue time —
-- doc 50's own "the version stamp" lens), and the custom-quote/discount-
-- approval flow.

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('PER_SEAT', 'FLAT_MONTHLY', 'ONE_TIME_LICENSE');

-- AlterTable: PlatformPlan
ALTER TABLE "PlatformPlan" ADD COLUMN "pricingModel" "PricingModel" NOT NULL DEFAULT 'FLAT_MONTHLY';
ALTER TABLE "PlatformPlan" ADD COLUMN "perSeatPriceMinor" INTEGER;
ALTER TABLE "PlatformPlan" ADD COLUMN "oneTimeLicenseMinor" INTEGER;
ALTER TABLE "PlatformPlan" ADD COLUMN "licenseDeploymentMode" TEXT;

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'CREDITED');

-- CreateTable: PlatformInvoice
CREATE TABLE "PlatformInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "planId" TEXT NOT NULL,
    "pricingModel" "PricingModel" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "seatCount" INTEGER,
    "seatPriceMinorSnapshot" INTEGER,
    "flatPriceMinorSnapshot" INTEGER,
    "oneTimePriceMinorSnapshot" INTEGER,
    "amountMinor" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PlatformInvoiceCreditNote — a billing dispute's own
-- resolution record, never an edited invoice line.
CREATE TABLE "PlatformInvoiceCreditNote" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedByOpsClientId" TEXT,

    CONSTRAINT "PlatformInvoiceCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable: PlatformCustomQuote
CREATE TABLE "PlatformCustomQuote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "listPriceMinor" INTEGER NOT NULL,
    "quotedPriceMinor" INTEGER NOT NULL,
    "discountPct" DOUBLE PRECISION NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByOpsClientId" TEXT NOT NULL,
    "approvedByOpsClientId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformCustomQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformInvoice_tenantId_issuedAt_idx" ON "PlatformInvoice"("tenantId", "issuedAt");

-- CreateIndex: idempotency per tenant/period — doc 50's own "second copy
-- of the write" answer, a retried billing run issues no second invoice.
CREATE UNIQUE INDEX "PlatformInvoice_tenantId_periodStart_periodEnd_key" ON "PlatformInvoice"("tenantId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "PlatformInvoiceCreditNote_invoiceId_idx" ON "PlatformInvoiceCreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "PlatformCustomQuote_tenantId_idx" ON "PlatformCustomQuote"("tenantId");

-- CreateIndex
CREATE INDEX "PlatformCustomQuote_status_idx" ON "PlatformCustomQuote"("status");

-- AddForeignKey
ALTER TABLE "PlatformInvoice" ADD CONSTRAINT "PlatformInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformInvoice" ADD CONSTRAINT "PlatformInvoice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformInvoiceCreditNote" ADD CONSTRAINT "PlatformInvoiceCreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PlatformInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCustomQuote" ADD CONSTRAINT "PlatformCustomQuote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCustomQuote" ADD CONSTRAINT "PlatformCustomQuote_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

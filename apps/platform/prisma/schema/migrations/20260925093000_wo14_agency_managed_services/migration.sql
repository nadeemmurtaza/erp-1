-- WO-14.1 (docs/implementation/commercial-licensing-agency/
-- 14-managed-services-module.md), ADR-039 — the agency-hosted managed-
-- services billing/hosting dashboard. Per ADR-039, this reuses
-- `PlatformTenant` (rather than a new `AgencyClient` table) and
-- `PlatformInvoice` (rather than a new "local invoice cache" table) for
-- every fact those rows already hold; only the columns below are
-- genuinely new, plus the one new table (`AgencyUsageSnapshot`) doc 14
-- has no existing equivalent for.

-- AlterTable: PlatformTenant — the agency-specific fields. All nullable:
-- an existing tenant is not agency-registered until
-- AgencyClientsService.register() runs, and nullability of apiKeyHash IS
-- "has this tenant been onboarded to the managed-services dashboard yet"
-- (see the model's own doc comment).
ALTER TABLE "PlatformTenant" ADD COLUMN "mailDomain" TEXT;
ALTER TABLE "PlatformTenant" ADD COLUMN "apiKeyHash" TEXT;
ALTER TABLE "PlatformTenant" ADD COLUMN "apiKeyRotatedAt" TIMESTAMP(3);
ALTER TABLE "PlatformTenant" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "PlatformTenant" ADD COLUMN "stripeSubscriptionId" TEXT;

CREATE UNIQUE INDEX "PlatformTenant_apiKeyHash_key" ON "PlatformTenant"("apiKeyHash");
CREATE UNIQUE INDEX "PlatformTenant_stripeCustomerId_key" ON "PlatformTenant"("stripeCustomerId");
CREATE UNIQUE INDEX "PlatformTenant_stripeSubscriptionId_key" ON "PlatformTenant"("stripeSubscriptionId");

-- CreateEnum
CREATE TYPE "StripeInvoicePaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- AlterTable: PlatformInvoice — real-money linkage bridged onto the
-- ALREADY-authoritative row (ADR-039), never a second invoice table.
ALTER TABLE "PlatformInvoice" ADD COLUMN "stripeInvoiceId" TEXT;
ALTER TABLE "PlatformInvoice" ADD COLUMN "stripeHostedInvoiceUrl" TEXT;
ALTER TABLE "PlatformInvoice" ADD COLUMN "stripePaymentStatus" "StripeInvoicePaymentStatus";
ALTER TABLE "PlatformInvoice" ADD COLUMN "stripePaymentFailedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "PlatformInvoice_stripeInvoiceId_key" ON "PlatformInvoice"("stripeInvoiceId");

-- CreateTable: AgencyUsageSnapshot — the one genuinely new table doc 14
-- needs. One row per (tenant, calendar day), upserted, never a blind
-- insert (doc 14's own "second copy of the write" acceptance criterion).
CREATE TABLE "AgencyUsageSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "databaseBytes" BIGINT NOT NULL,
    "emailsSent30d" INTEGER,
    "activeUsers30d" INTEGER NOT NULL,

    CONSTRAINT "AgencyUsageSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgencyUsageSnapshot_tenantId_snapshotDate_key" ON "AgencyUsageSnapshot"("tenantId", "snapshotDate");
CREATE INDEX "AgencyUsageSnapshot_tenantId_snapshotDate_idx" ON "AgencyUsageSnapshot"("tenantId", "snapshotDate");

ALTER TABLE "AgencyUsageSnapshot" ADD CONSTRAINT "AgencyUsageSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PlatformTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

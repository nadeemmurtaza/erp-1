-- WO-39.5 / WO-39.6 / WO-39.7 / WO-39.3 (docs/implementation/commercial-licensing-agency/
-- 39-shared-cross-tenant-hosting-tier.md) — the remaining application-layer
-- pieces of doc 39: support-grant display state, resource-quota
-- configuration and alerting, tenant data export, and the columns
-- hostname routing (WO-39.3) and retention/teardown (WO-39.7) need on
-- PlatformTenant itself. No orchestrator-level enforcement lives here —
-- doc 39's own "Out of scope" section excludes that explicitly.

-- AlterTable: SupportAccessGrant — WO-39.5's own cron-writes-a-display-flag
-- field; access control never reads this column (see platform.prisma's own
-- doc comment on it).
ALTER TABLE "SupportAccessGrant" ADD COLUMN "markedInertAt" TIMESTAMP(3);

-- AlterTable: PlatformTenant — WO-39.3's domain-verification gate and
-- WO-39.7's retention/teardown bookkeeping.
ALTER TABLE "PlatformTenant" ADD COLUMN "customDomainVerifiedAt" TIMESTAMP(3);
ALTER TABLE "PlatformTenant" ADD COLUMN "retentionExpiresAt" TIMESTAMP(3);
ALTER TABLE "PlatformTenant" ADD COLUMN "dataDeletedAt" TIMESTAMP(3);

-- CreateTable: ResourceTierQuota — WO-39.6's per-(resourceTier, metric)
-- limit, checked against the SAME PlatformUsageRecord rows doc 39 already
-- collects for billing.
CREATE TABLE "ResourceTierQuota" (
    "id" TEXT NOT NULL,
    "resourceTier" "ResourceTier" NOT NULL,
    "metric" TEXT NOT NULL,
    "limitValue" DOUBLE PRECISION NOT NULL,
    "warnThresholdPct" INTEGER NOT NULL DEFAULT 80,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceTierQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ResourceQuotaAlert — one row per (tenant, metric, window)
-- that crossed its threshold; the unique constraint below is this table's
-- own idempotency guard against a re-run double-alerting the same window.
CREATE TABLE "ResourceQuotaAlert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "observedValue" DOUBLE PRECISION NOT NULL,
    "limitValue" DOUBLE PRECISION NOT NULL,
    "thresholdPct" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "ResourceQuotaAlert_pkey" PRIMARY KEY ("id")
);

-- CreateEnum
CREATE TYPE "TenantExportStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "TenantExportTrigger" AS ENUM ('MANUAL', 'DEPROVISION');

-- CreateTable: TenantDataExport — WO-39.7's own export job record.
CREATE TABLE "TenantDataExport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "TenantExportStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredBy" "TenantExportTrigger" NOT NULL DEFAULT 'MANUAL',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "storageKey" TEXT,
    "sizeBytes" BIGINT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "TenantDataExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResourceTierQuota_resourceTier_metric_key" ON "ResourceTierQuota"("resourceTier", "metric");

-- CreateIndex
CREATE INDEX "ResourceQuotaAlert_tenantId_createdAt_idx" ON "ResourceQuotaAlert"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceQuotaAlert_tenantId_metric_windowStart_key" ON "ResourceQuotaAlert"("tenantId", "metric", "windowStart");

-- CreateIndex
CREATE INDEX "TenantDataExport_tenantId_requestedAt_idx" ON "TenantDataExport"("tenantId", "requestedAt");

-- CreateIndex: PlatformTenant — WO-39.7's retention-sweep read path.
CREATE INDEX "PlatformTenant_status_retentionExpiresAt_idx" ON "PlatformTenant"("status", "retentionExpiresAt");

-- AddForeignKey
ALTER TABLE "ResourceQuotaAlert" ADD CONSTRAINT "ResourceQuotaAlert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantDataExport" ADD CONSTRAINT "TenantDataExport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

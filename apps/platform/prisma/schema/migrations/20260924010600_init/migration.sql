-- WO-39.1 (docs/implementation/39-shared-cross-tenant-hosting-tier.md) — the
-- control-plane schema's foundation tables. This runs against
-- PLATFORM_DATABASE_URL, a database that is never shared with any tenant's
-- own (apps/api's schema) — see the DECISIONS.md entry on
-- shared-infrastructure/isolated-data. PlatformTenant.deploymentRef points
-- at TenantDeploymentCredential, never a plaintext connection string.

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DEPROVISIONED');

-- CreateEnum
CREATE TYPE "ResourceTier" AS ENUM ('STANDARD', 'PLUS', 'DEDICATED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OpsClientStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "PlatformTenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "customDomain" TEXT,
    "legalName" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'PROVISIONING',
    "planId" TEXT NOT NULL,
    "deploymentRef" TEXT,
    "resourceTier" "ResourceTier" NOT NULL DEFAULT 'STANDARD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "deprovisionedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformTenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformPlan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "editionCap" TEXT NOT NULL,
    "monthlyPriceMinor" INTEGER NOT NULL,
    "includedResourceTier" "ResourceTier" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlatformPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "startedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedOn" TIMESTAMP(3),
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "PlatformSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformUsageRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PlatformUsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportAccessGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "grantedToUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "accessedAt" TIMESTAMP(3)[],

    CONSTRAINT "SupportAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantDeploymentCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionStringEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),

    CONSTRAINT "TenantDeploymentCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformOpsClient" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "status" "OpsClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformOpsClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformTenant_slug_key" ON "PlatformTenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformTenant_customDomain_key" ON "PlatformTenant"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformTenant_deploymentRef_key" ON "PlatformTenant"("deploymentRef");

-- CreateIndex
CREATE INDEX "PlatformTenant_status_idx" ON "PlatformTenant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPlan_key_key" ON "PlatformPlan"("key");

-- CreateIndex
CREATE INDEX "PlatformSubscription_tenantId_status_idx" ON "PlatformSubscription"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PlatformUsageRecord_tenantId_windowStart_idx" ON "PlatformUsageRecord"("tenantId", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformUsageRecord_tenantId_metric_windowStart_key" ON "PlatformUsageRecord"("tenantId", "metric", "windowStart");

-- CreateIndex
CREATE INDEX "SupportAccessGrant_tenantId_expiresAt_idx" ON "SupportAccessGrant"("tenantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantDeploymentCredential_tenantId_key" ON "TenantDeploymentCredential"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformOpsClient_keyHash_key" ON "PlatformOpsClient"("keyHash");

-- CreateIndex
CREATE INDEX "PlatformOpsClient_status_idx" ON "PlatformOpsClient"("status");

-- AddForeignKey
ALTER TABLE "PlatformTenant" ADD CONSTRAINT "PlatformTenant_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSubscription" ADD CONSTRAINT "PlatformSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSubscription" ADD CONSTRAINT "PlatformSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformUsageRecord" ADD CONSTRAINT "PlatformUsageRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAccessGrant" ADD CONSTRAINT "SupportAccessGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantDeploymentCredential" ADD CONSTRAINT "TenantDeploymentCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

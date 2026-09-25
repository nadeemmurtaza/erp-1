-- WO-51.1 / WO-51.2 / WO-51.5 (docs/implementation/commercial-licensing-agency/
-- 51-free-demo-sandbox-onboarding.md) — the TRIAL status, the columns a
-- trial and self-service signup need on PlatformTenant, the pending-
-- verification row a signup form holds before it is ever allowed to call
-- ProvisioningService, and the audit trail behind `platform.trials.extend`.

-- AlterEnum: TenantStatus — the new value is not referenced anywhere else
-- in this same migration transaction, which is what PostgreSQL 12+ allows.
ALTER TYPE "TenantStatus" ADD VALUE 'TRIAL';

-- AlterTable: PlatformTenant
ALTER TABLE "PlatformTenant" ADD COLUMN "trialExpiresAt" TIMESTAMP(3);
ALTER TABLE "PlatformTenant" ADD COLUMN "billingContactEmail" TEXT;
ALTER TABLE "PlatformTenant" ADD COLUMN "signupEmailVerifiedAt" TIMESTAMP(3);

-- CreateTable: SignupVerification — doc 51 §3's own "thin request" held
-- unprovisioned until its email link is followed.
CREATE TABLE "SignupVerification" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "ipAddress" TEXT,

    CONSTRAINT "SignupVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TrialExtension — WO-51.5's own audit trail.
CREATE TABLE "TrialExtension" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "previousExpiresAt" TIMESTAMP(3) NOT NULL,
    "newExpiresAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "extendedByOpsClientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialExtension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignupVerification_tokenHash_key" ON "SignupVerification"("tokenHash");

-- CreateIndex
CREATE INDEX "SignupVerification_email_createdAt_idx" ON "SignupVerification"("email", "createdAt");

-- CreateIndex
CREATE INDEX "TrialExtension_tenantId_createdAt_idx" ON "TrialExtension"("tenantId", "createdAt");

-- CreateIndex: PlatformTenant — the expiry cron's own bounded-batch read path.
CREATE INDEX "PlatformTenant_status_trialExpiresAt_idx" ON "PlatformTenant"("status", "trialExpiresAt");

-- AddForeignKey
ALTER TABLE "TrialExtension" ADD CONSTRAINT "TrialExtension_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

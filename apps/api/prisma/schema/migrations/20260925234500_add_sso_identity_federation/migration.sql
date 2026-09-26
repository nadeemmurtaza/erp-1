-- SSO / identity federation —
-- docs/implementation/access-control-identity/161-sso-identity-federation.md
-- (WO-161.1).
--
-- Hand-written, forward-only (ADR-008). Purely additive: two new enums, one
-- new table, and one new nullable column on "User" with no default. Every
-- existing "User" row reads NULL there, which means exactly what it meant
-- before this migration — a password-only account, which single sign-on
-- leaves untouched — so there is nothing to backfill, and on a copy of
-- production data this behaves exactly as on an empty database.
--
-- Rollback, should it ever be needed, is a new forward migration dropping
-- the table, the column and the two enums; nothing else references them.

-- CreateEnum — OIDC only; SAML is WO-161.2b, added once a real client names
-- a SAML-only identity provider.
CREATE TYPE "SsoProtocol" AS ENUM ('OIDC');

-- CreateEnum
CREATE TYPE "SsoConnectionStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable — `<issuer>#<sub>` of the linked identity, or NULL.
ALTER TABLE "User" ADD COLUMN     "ssoExternalId" TEXT;

-- CreateTable
CREATE TABLE "SsoConnection" (
    "id" TEXT NOT NULL,
    "protocol" "SsoProtocol" NOT NULL,
    "label" TEXT NOT NULL,
    "issuerUrl" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "credentialEncrypted" TEXT NOT NULL,
    "allowedEmailDomains" TEXT[],
    "defaultRoleName" TEXT NOT NULL,
    "status" "SsoConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SsoConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — the sign-in screen's list of ACTIVE connections.
CREATE INDEX "SsoConnection_status_idx" ON "SsoConnection"("status");

-- CreateIndex — not unique: sign-in resolves by email first. It serves the
-- one lookup by identity, SsoService refusing to link an external identity
-- already linked to a different account.
CREATE INDEX "User_ssoExternalId_idx" ON "User"("ssoExternalId");

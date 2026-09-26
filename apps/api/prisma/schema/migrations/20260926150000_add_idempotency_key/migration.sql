-- A client-supplied Idempotency-Key, closing the one gap doc 117's own
-- domain-key strategy structurally cannot reach.
-- architecture-patterns/157-client-request-idempotency-keys.md (WO-157.1),
-- DECISIONS.md ADR-053.
--
-- Hand-written, forward-only (ADR-008). Purely additive. No organizationId
-- (ADR-044/ADR-040): this deployment IS the tenant.

-- CreateEnum
CREATE TYPE "IdempotencyKeyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "IdempotencyKeyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_scope_key_key" ON "IdempotencyKey"("scope", "key");

-- CreateIndex
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

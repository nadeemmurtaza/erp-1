-- Personal API keys — docs/implementation/access-control-identity/163-personal-api-keys.md,
-- DECISIONS.md ADR-037.
--
-- Hand-written, forward-only (ADR-008). Purely additive: two new enums and
-- one new table. No existing column is touched, so there is nothing to
-- backfill, no existing row changes meaning, and on a copy of production data
-- this migration behaves exactly as on an empty database.

-- CreateEnum
CREATE TYPE "ApiKeySurface" AS ENUM ('ADMIN', 'STOREFRONT');

-- CreateEnum
CREATE TYPE "ApiKeyRevocationReason" AS ENUM ('OWNER', 'ADMINISTRATOR', 'OWNER_DEACTIVATED');

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surface" "ApiKeySurface" NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "permissionKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customerScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" "ApiKeyRevocationReason",
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — the credential lookup on every key-authenticated request.
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex — the owner's own list, and the deactivation revoke.
CREATE INDEX "ApiKey_userId_createdAt_idx" ON "ApiKey"("userId", "createdAt");

-- CreateIndex — the users.manage oversight list, newest first.
CREATE INDEX "ApiKey_createdAt_idx" ON "ApiKey"("createdAt");

-- AddForeignKey — a key dies with its owner: a credential has no ledger
-- value (canonical ruling 1's "cascade" disposition).
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey — an edge to whoever revoked it; null after that person's
-- own erasure, while revokedReason still says which kind of actor it was.
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Two invariants the database enforces itself, because a key's reach is a
-- security boundary and "an application-only guarantee is one bug away" from
-- being wrong (the same reasoning as the ledger's triggers in
-- 20260917070552_add_accounting_ledger). Prisma's schema DSL can express
-- neither, so they are hand-written here — the only part of this migration
-- that is.
-- ============================================================================

-- Invariant 1: a key belongs to exactly one scope catalogue, and carries at
-- least one scope from it. An ADMIN key has permission keys and no customer
-- scopes; a STOREFRONT key the reverse — so what a key can see is never
-- ambiguous. COALESCE because Prisma leaves list columns nullable, and a NULL
-- must not slip past a CHECK (which treats NULL as passing).
--
-- Revocation fields travel together: a reason exactly when revoked.
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_one_catalogue_check" CHECK (
  (
    "surface" = 'ADMIN'
    AND COALESCE(cardinality("permissionKeys"), 0) > 0
    AND COALESCE(cardinality("customerScopes"), 0) = 0
  )
  OR (
    "surface" = 'STOREFRONT'
    AND COALESCE(cardinality("customerScopes"), 0) > 0
    AND COALESCE(cardinality("permissionKeys"), 0) = 0
  )
);

ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_revocation_fields_check" CHECK (
  ("revokedAt" IS NULL) = ("revokedReason" IS NULL)
);

-- Invariant 2: revocation is final. Once revokedAt is set, nothing about the
-- key may change — it cannot be un-revoked, re-keyed, re-scoped, renamed or
-- given a new expiry, by this code or any code written later. The one update
-- still allowed is the ON DELETE SET NULL on revokedById that Postgres itself
-- performs when the revoking person's account is erased (updatedAt is
-- application-maintained, so it does not move on that update either).
CREATE OR REPLACE FUNCTION forbid_revoked_api_key_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD."revokedAt" IS NOT NULL AND (
    NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt"
    OR NEW."revokedReason" IS DISTINCT FROM OLD."revokedReason"
    OR NEW."keyHash" IS DISTINCT FROM OLD."keyHash"
    OR NEW."lastFour" IS DISTINCT FROM OLD."lastFour"
    OR NEW."permissionKeys" IS DISTINCT FROM OLD."permissionKeys"
    OR NEW."customerScopes" IS DISTINCT FROM OLD."customerScopes"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."surface" IS DISTINCT FROM OLD."surface"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."name" IS DISTINCT FROM OLD."name"
    OR (NEW."revokedById" IS DISTINCT FROM OLD."revokedById" AND NEW."revokedById" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'ApiKey % is revoked, and a revoked key is final — issue a new key instead', OLD.id
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER api_key_revocation_is_final
  BEFORE UPDATE ON "ApiKey"
  FOR EACH ROW
  EXECUTE FUNCTION forbid_revoked_api_key_mutation();

-- Explicit, time-boxed access grants over an OrgUnit subtree —
-- docs/implementation/access-control-identity/21-access-over-the-org-tree.md
-- (WO-21.1).
--
-- Hand-written, forward-only (ADR-008). Purely additive. Derived access
-- from a Posting is NOT a table — GrantService computes it from open
-- Posting rows at read time, so it can never outlive the post.

-- CreateEnum
CREATE TYPE "GrantMode" AS ENUM ('READ', 'ACTING');

-- CreateTable
CREATE TABLE "OrgUnitGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "permissionKeys" TEXT[],
    "mode" "GrantMode" NOT NULL DEFAULT 'READ',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "countersignedByUserId" TEXT,
    "reason" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgUnitGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgUnitGrant_userId_expiresAt_idx" ON "OrgUnitGrant"("userId", "expiresAt");
CREATE INDEX "OrgUnitGrant_orgUnitId_idx" ON "OrgUnitGrant"("orgUnitId");

-- AddForeignKey
ALTER TABLE "OrgUnitGrant" ADD CONSTRAINT "OrgUnitGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrgUnitGrant" ADD CONSTRAINT "OrgUnitGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrgUnitGrant" ADD CONSTRAINT "OrgUnitGrant_countersignedByUserId_fkey" FOREIGN KEY ("countersignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrgUnitGrant" ADD CONSTRAINT "OrgUnitGrant_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

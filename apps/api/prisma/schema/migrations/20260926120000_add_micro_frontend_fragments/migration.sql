-- Micro-frontend fragments: a designated remote mount point, opt-in per
-- fragment, never the default composition model. architecture-patterns/
-- 143-micro-frontend-architecture.md (WO-143.2), DECISIONS.md ADR-049.
--
-- Hand-written, forward-only (ADR-008). Purely additive. No organizationId
-- (ADR-044/ADR-040): this deployment IS the tenant.

-- CreateEnum
CREATE TYPE "FragmentStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "MicroFrontendFragment" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "remoteUrl" TEXT NOT NULL,
    "mountPoints" TEXT[],
    "status" "FragmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "attestedAt" TIMESTAMP(3) NOT NULL,
    "attestedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicroFrontendFragment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MicroFrontendFragment_key_key" ON "MicroFrontendFragment"("key");

-- AddForeignKey
ALTER TABLE "MicroFrontendFragment" ADD CONSTRAINT "MicroFrontendFragment_attestedByUserId_fkey" FOREIGN KEY ("attestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

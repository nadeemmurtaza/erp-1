-- A bulletin board — a persistent, browsable record of policy notices and
-- memos, distinct from doc 24's own push notifications.
-- tasks-notifications-support/61-policy-communications-bulletin.md
-- (WO-61.1), DECISIONS.md ADR-062.
--
-- Hand-written, forward-only (ADR-008). Purely additive. No organizationId
-- anywhere (ADR-040/ADR-044/ADR-046/ADR-049/ADR-060): this deployment IS
-- the tenant boundary. authorId/userId, not employeeId — no Employee model
-- exists in this codebase (ADR-044).

-- CreateEnum
CREATE TYPE "BulletinCategory" AS ENUM ('POLICY', 'MEMO', 'NOTICE', 'HR_ANNOUNCEMENT');

-- CreateTable
CREATE TABLE "Bulletin" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "category" "BulletinCategory" NOT NULL,
    "audienceOrgUnitId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bulletin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulletinAcknowledgement" (
    "id" TEXT NOT NULL,
    "bulletinId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BulletinAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bulletin_audienceOrgUnitId_publishedAt_idx" ON "Bulletin"("audienceOrgUnitId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BulletinAcknowledgement_bulletinId_userId_key" ON "BulletinAcknowledgement"("bulletinId", "userId");

-- AddForeignKey
ALTER TABLE "BulletinAcknowledgement" ADD CONSTRAINT "BulletinAcknowledgement_bulletinId_fkey" FOREIGN KEY ("bulletinId") REFERENCES "Bulletin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

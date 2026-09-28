-- resilience-scalability/206-rate-limiting-caching-compression-hardening.md
-- §2.2 (WO-206.3) — refresh-token reuse detection with a 10-second grace
-- window. Additive only: three columns on RefreshToken, no column dropped,
-- no row deleted.
--
--   familyId     — every token descended from one sign-in, so a reuse
--                  outside the grace window can revoke all of them at once.
--   rotatedAt    — when a token was exchanged for its successor; null means
--                  never rotated (live, or revoked by logout/password change/
--                  deactivation, none of which is reuse).
--   replacedById — the successor, so a replay inside the window is answered
--                  with the same token pair the first rotation issued.
--
-- Rows written before this migration were never linked to their successors,
-- so each becomes the root of its own family (familyId = its own id) and
-- keeps rotatedAt null: an old, already-rotated token presented again is
-- refused exactly as it was before this change (401), and is never mistaken
-- for reuse. The backfill UPDATE touches every row once and SET NOT NULL
-- scans the table once under its lock; both finish in seconds at a few
-- million rows, inside the deploy's own migrate step.

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN "familyId" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "rotatedAt" TIMESTAMP(3);
ALTER TABLE "RefreshToken" ADD COLUMN "replacedById" TEXT;

-- Backfill: every pre-existing token is its own family.
UPDATE "RefreshToken" SET "familyId" = "id" WHERE "familyId" IS NULL;

ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_replacedById_key" ON "RefreshToken"("replacedById");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "RefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Embedding a third-party dashboard: a narrow iframe pattern, not a
-- micro-frontend architecture. architecture-patterns/113-micro-frontend-
-- embedding.md (WO-113.1), DECISIONS.md ADR-045.
--
-- Hand-written, forward-only (ADR-008). Purely additive. No organizationId
-- (ADR-044/ADR-040): this deployment IS the tenant.

-- CreateTable
CREATE TABLE "EmbeddedWidget" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmbeddedWidget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmbeddedWidget_key_key" ON "EmbeddedWidget"("key");

-- AddForeignKey
ALTER TABLE "EmbeddedWidget" ADD CONSTRAINT "EmbeddedWidget_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

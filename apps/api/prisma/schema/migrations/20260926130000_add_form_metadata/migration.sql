-- A general metadata-driven UI engine, built by explicit owner override
-- (ADR-026). architecture-patterns/141-general-metadata-driven-ui-engine.md
-- (WO-141.1), DECISIONS.md ADR-049.
--
-- Hand-written, forward-only (ADR-008). Purely additive. No organizationId
-- (ADR-044/ADR-040): this deployment IS the tenant.

-- CreateTable
CREATE TABLE "FormMetadata" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormMetadata_entityType_key" ON "FormMetadata"("entityType");

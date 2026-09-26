-- A general EAV model, built by explicit owner override (ADR-026).
-- architecture-patterns/140-general-eav-extensibility-model.md (WO-140.1),
-- DECISIONS.md ADR-046.
--
-- Hand-written, forward-only (ADR-008). Purely additive. No organizationId
-- (ADR-044/ADR-040): this deployment IS the tenant. No foreign key to the
-- target entity: entityType varies, so cascading delete is not possible at
-- the database level — EntityAttributeService.deleteAll() must be called
-- explicitly by every entity's own deletion path that opts in.

-- CreateTable
CREATE TABLE "EntityAttribute" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "attributeKey" TEXT NOT NULL,
    "attributeValue" TEXT NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'TEXT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntityAttribute_entityType_entityId_attributeKey_key" ON "EntityAttribute"("entityType", "entityId", "attributeKey");
CREATE INDEX "EntityAttribute_entityType_entityId_idx" ON "EntityAttribute"("entityType", "entityId");

-- WO-23.3c/e (RETAIL-ERP.md R9/R13, ADR-023). Node.retailBrandId names which
-- brand a registered child node belongs to — nullable, no backfill: every
-- Node row registered before this column existed honestly has no brand
-- recorded yet, which the receiving-tier policy check treats as "cannot
-- verify" (fail closed), never as "nothing to check". PolicyQuarantine is
-- R9's OTHER quarantine — a fact that applied but whose own scopeLevel
-- disagrees with the BrandPolicy switch meant to govern it — deliberately a
-- new table, not a column on the existing apply-failure ReplicationQuarantine
-- (which is keyed to a replication sequence, not a policy decision).

-- AlterTable
ALTER TABLE "Node" ADD COLUMN     "retailBrandId" TEXT;

-- CreateTable
CREATE TABLE "PolicyQuarantine" (
    "id" TEXT NOT NULL,
    "originNodeId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "policyKey" TEXT NOT NULL,
    "retailBrandId" TEXT,
    "payload" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReplicationQuarantineStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedNote" TEXT,

    CONSTRAINT "PolicyQuarantine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PolicyQuarantine_status_idx" ON "PolicyQuarantine"("status");

-- CreateIndex
CREATE INDEX "PolicyQuarantine_entity_entityId_idx" ON "PolicyQuarantine"("entity", "entityId");

-- CreateIndex
CREATE INDEX "PolicyQuarantine_retailBrandId_idx" ON "PolicyQuarantine"("retailBrandId");

-- CreateIndex
CREATE INDEX "Node_retailBrandId_idx" ON "Node"("retailBrandId");

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_retailBrandId_fkey" FOREIGN KEY ("retailBrandId") REFERENCES "RetailBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyQuarantine" ADD CONSTRAINT "PolicyQuarantine_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

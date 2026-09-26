-- Org structure: OrgUnitType, OrgUnit —
-- docs/implementation/hr-people-org/19-org-structure-offices-departments.md
-- (WO-19.1), DECISIONS.md ADR-044.
--
-- Hand-written, forward-only (ADR-008). Purely additive: two new tables and
-- two new nullable back-relation columns are not needed here (Node/
-- RetailBrand gain no new column — OrgUnit is the child side of both
-- relations). Nothing existing changes shape.

-- CreateTable
CREATE TABLE "OrgUnitType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "isOffice" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrgUnitType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgUnit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "parentId" TEXT,
    "path" TEXT[],
    "depth" INTEGER NOT NULL DEFAULT 0,
    "nodeId" TEXT,
    "retailBrandId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgUnitType_key_key" ON "OrgUnitType"("key");

-- CreateIndex
CREATE INDEX "OrgUnit_parentId_idx" ON "OrgUnit"("parentId");

-- CreateIndex
CREATE INDEX "OrgUnit_path_idx" ON "OrgUnit" USING GIN ("path");

-- CreateIndex
CREATE INDEX "OrgUnit_nodeId_idx" ON "OrgUnit"("nodeId");

-- CreateIndex — real protection at the common (group-wide, retailBrandId
-- NULL) case: a NULL in a normal composite unique exempts the row from
-- comparison entirely (the same trap already documented on AdminScope and
-- Location.code), so the branded case is a normal composite unique and the
-- group-wide case gets its own partial index instead of silently allowing
-- duplicate codes.
CREATE UNIQUE INDEX "OrgUnit_retailBrandId_code_key" ON "OrgUnit"("retailBrandId", "code");
CREATE UNIQUE INDEX "org_unit_code_group_wide" ON "OrgUnit" ("code") WHERE "retailBrandId" IS NULL;

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "OrgUnitType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_retailBrandId_fkey" FOREIGN KEY ("retailBrandId") REFERENCES "RetailBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

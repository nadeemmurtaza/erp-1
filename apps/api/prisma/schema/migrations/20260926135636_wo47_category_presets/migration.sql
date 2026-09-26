-- WO-47.1 (47-preconfigured-sector-taxonomy.md) — additive only.
-- Hand-edited: the raw `migrate dev --create-only` diff also emitted DROP
-- INDEX statements for pre-existing vector/trigram search indexes unrelated
-- to this change (the same schema-drift artifact seen in
-- 20260926134514_wo146_pricing_module/migration.sql) — removed per this
-- repo's own migration discipline.

-- CreateTable
CREATE TABLE "CategoryPreset" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "treeJson" JSONB NOT NULL,
    "description" TEXT,

    CONSTRAINT "CategoryPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryPreset_key_key" ON "CategoryPreset"("key");

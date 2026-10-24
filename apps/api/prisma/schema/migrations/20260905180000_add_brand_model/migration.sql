-- Brand becomes a managed list instead of free text on Product.
--
-- Product.brand was a nullable String typed per product, so "Gul Ahmed",
-- "gul ahmed" and "Gul  Ahmed" counted as three different brands to every
-- filter and report. This creates the table, moves existing values into it,
-- points Product at them, and only then drops the old column. Prisma runs a
-- migration in one transaction, so a failure anywhere leaves `brand` intact.

CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BrandTranslation" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "BrandTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");
CREATE INDEX "Brand_isActive_idx" ON "Brand"("isActive");
CREATE UNIQUE INDEX "BrandTranslation_brandId_locale_key" ON "BrandTranslation"("brandId", "locale");

ALTER TABLE "BrandTranslation" ADD CONSTRAINT "BrandTranslation_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product" ADD COLUMN "brandId" TEXT;

-- One row per distinct brand, matched case- and whitespace-insensitively so
-- the three spellings above collapse into one. Separate statements rather
-- than chained CTEs: rows inserted by one data-modifying CTE are not visible
-- to a sibling CTE, which would make the translation insert fragile.
CREATE TEMP TABLE brand_backfill ON COMMIT DROP AS
SELECT
    lower(btrim(regexp_replace("brand", '\s+', ' ', 'g')))            AS match_key,
    -- Keep the best-looking spelling, not just the first alphabetically:
    -- prefer one carrying capitals ("Gul Ahmed" over "gul ahmed"), since this
    -- label is what customers see. All-lowercase groups fall back to min().
    COALESCE(
        min(btrim(regexp_replace("brand", '\s+', ' ', 'g')))
            FILTER (WHERE btrim(regexp_replace("brand", '\s+', ' ', 'g'))
                       <> lower(btrim(regexp_replace("brand", '\s+', ' ', 'g')))),
        min(btrim(regexp_replace("brand", '\s+', ' ', 'g')))
    )                                                                 AS label,
    'brand_' || substr(md5(lower(btrim(regexp_replace("brand", '\s+', ' ', 'g')))), 1, 20) AS brand_id
FROM "Product"
WHERE "brand" IS NOT NULL AND btrim("brand") <> ''
GROUP BY 1, 3;

INSERT INTO "Brand" ("id", "slug", "order", "isActive", "createdAt", "updatedAt")
SELECT
    brand_id,
    -- Slug from the label; runs of non-alphanumerics become one dash. A label
    -- that slugs to nothing (e.g. only punctuation) falls back to the id.
    COALESCE(
        NULLIF(btrim(regexp_replace(lower(label), '[^a-z0-9]+', '-', 'g'), '-'), ''),
        brand_id
    ),
    0,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM brand_backfill;

INSERT INTO "BrandTranslation" ("id", "brandId", "locale", "name")
SELECT 'btr_' || substr(brand_id, 7), brand_id, 'en', label
FROM brand_backfill;

UPDATE "Product" p
SET "brandId" = b.brand_id
FROM brand_backfill b
WHERE b.match_key = lower(btrim(regexp_replace(p."brand", '\s+', ' ', 'g')));

ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every value now has a Brand row and every product points at one, so the
-- column has no readers left. Dropped last: if anything above failed, the
-- transaction rolls back and this never runs.
ALTER TABLE "Product" DROP COLUMN "brand";

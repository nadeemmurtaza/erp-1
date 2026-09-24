-- WO-3.1/3.3/3.6/3.7/3.9 (docs/implementation/03-variants-sku-seo.md) —
-- completing Phase 3's remaining schema:
--   * OptionTemplate/OptionTemplateValue (+ translations): the store-level
--     reusable option library WO-3.1 specified but never built. Global, not
--     per-product — a product instantiates from one by copying values into
--     its own ProductOption/ProductOptionValue rows.
--   * ProductImageTranslation: alt text per locale (House Rule 6). Additive
--     only — ProductImage.alt stays, unwritten going forward, so nothing
--     that still reads it breaks. Backfilled below from the current value,
--     skipping anything filename-shaped (the same regex the doc specifies),
--     which is left empty on purpose rather than carrying the lie forward.
--   * Product.code / Category.code: SKU-template inputs (WO-3.3).
--   * Product.noindex / Product.canonicalOverride / ProductTranslation.
--     focusKeyword: the SEO section's own fields (WO-3.7).
--   * ProductVariant.skuIsManual: stops the generator rewriting a SKU a
--     human already edited (WO-3.3).
--   * Redirect: WO-3.9's own table, verbatim from the doc.
-- No existing column is touched or dropped. size/color/colorHex on
-- ProductVariant remain exactly as WO-3.1's own migration left them.

-- AlterTable
ALTER TABLE "Category" ADD COLUMN "code" TEXT;

-- AlterTable
ALTER TABLE "Product"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "noindex" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canonicalOverride" TEXT;

-- AlterTable
ALTER TABLE "ProductTranslation" ADD COLUMN "focusKeyword" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN "skuIsManual" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProductImageTranslation" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "alt" TEXT NOT NULL,

    CONSTRAINT "ProductImageTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductImageTranslation_imageId_locale_key" ON "ProductImageTranslation"("imageId", "locale");

-- AddForeignKey
ALTER TABLE "ProductImageTranslation" ADD CONSTRAINT "ProductImageTranslation_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "ProductImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: move today's ProductImage.alt into an "en" translation row,
-- unless it looks like a filename — same guard as WO-3.6's own spec, so a
-- lie does not get promoted into the new, supposedly-trustworthy model.
INSERT INTO "ProductImageTranslation" ("id", "imageId", "locale", "alt")
SELECT
  "id",
  "id",
  'en',
  "alt"
FROM "ProductImage"
WHERE "alt" IS NOT NULL
  AND btrim("alt") <> ''
  AND "alt" !~ '\.[A-Za-z0-9]{2,5}$'
  AND "alt" !~ '^(IMG|DSC|PXL|Screenshot)[-_ ]?\d+$';

-- CreateTable
CREATE TABLE "OptionTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "display" "OptionDisplay" NOT NULL DEFAULT 'BUTTON',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OptionTemplate_key_key" ON "OptionTemplate"("key");
CREATE INDEX "OptionTemplate_order_idx" ON "OptionTemplate"("order");

-- CreateTable
CREATE TABLE "OptionTemplateTranslation" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "OptionTemplateTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OptionTemplateTranslation_templateId_locale_key" ON "OptionTemplateTranslation"("templateId", "locale");

-- AddForeignKey
ALTER TABLE "OptionTemplateTranslation" ADD CONSTRAINT "OptionTemplateTranslation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OptionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "OptionTemplateValue" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "swatchHex" TEXT,
    "swatchUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OptionTemplateValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OptionTemplateValue_templateId_key_key" ON "OptionTemplateValue"("templateId", "key");
CREATE INDEX "OptionTemplateValue_templateId_order_idx" ON "OptionTemplateValue"("templateId", "order");

-- AddForeignKey
ALTER TABLE "OptionTemplateValue" ADD CONSTRAINT "OptionTemplateValue_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OptionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "OptionTemplateValueTranslation" (
    "id" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "OptionTemplateValueTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OptionTemplateValueTranslation_valueId_locale_key" ON "OptionTemplateValueTranslation"("valueId", "locale");

-- AddForeignKey
ALTER TABLE "OptionTemplateValueTranslation" ADD CONSTRAINT "OptionTemplateValueTranslation_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "OptionTemplateValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Redirect" (
    "id" TEXT NOT NULL,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 301,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Redirect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Redirect_fromPath_key" ON "Redirect"("fromPath");
CREATE INDEX "Redirect_isAutomatic_idx" ON "Redirect"("isAutomatic");

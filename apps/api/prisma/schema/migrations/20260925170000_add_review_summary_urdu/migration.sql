-- WO-9.9 (09-ai-layer.md) — House Rule 1: ProductReviewSummary.summaryText is
-- shown to any storefront visitor, so it needs an Urdu counterpart like every
-- other customer-facing string, not just an English default.
ALTER TABLE "ProductReviewSummary" ADD COLUMN "summaryTextUr" TEXT;

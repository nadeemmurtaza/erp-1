-- WO-8, docs/implementation/content-marketing-search/08-content-marketing-search.md.
-- Content (CMS), collections, full-text search, campaigns/broadcasts,
-- on-site messaging, and the abandoned-cart-recovery gaps (3-step sequence,
-- guest phone capture, recovered-revenue attribution). One migration for the
-- whole phase, same precedent as the WO-5 and WO-6 migrations.

-- Fuzzy/typo-tolerant matching for WO-8.3 search (trigram similarity on
-- ProductTranslation.name). Needs superuser or CREATEDB-owner privilege once
-- per database, which every environment here already has (this repo's own
-- migration user always owns the schema).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "CollectionSortStrategy" AS ENUM ('MANUAL', 'BEST_SELLING', 'NEWEST', 'PRICE_ASC', 'PRICE_DESC', 'MARGIN');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED_OPT_OUT', 'SKIPPED_NO_CONTACT', 'FAILED', 'OPENED', 'CLICKED');

-- CreateEnum
CREATE TYPE "OnsiteMessageKind" AS ENUM ('ANNOUNCEMENT_BAR', 'POPUP', 'NEWSLETTER_CAPTURE', 'COOKIE_CONSENT');

-- CreateEnum
CREATE TYPE "OnsitePopupTrigger" AS ENUM ('IMMEDIATE', 'TIMED', 'EXIT_INTENT');

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "firstTouchSentAt" TIMESTAMP(3),
ADD COLUMN     "guestMarketingConsentAt" TIMESTAMP(3),
ADD COLUMN     "guestPhone" TEXT,
ADD COLUMN     "incentivePromoCodeId" TEXT;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "marketingOptOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rfmComputedAt" TIMESTAMP(3),
ADD COLUMN     "rfmFrequencyScore" INTEGER,
ADD COLUMN     "rfmMonetaryScore" INTEGER,
ADD COLUMN     "rfmRecencyScore" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "sourceCartId" TEXT;

-- AlterTable
ALTER TABLE "ProductTranslation" ADD COLUMN     "searchVector" tsvector;

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "rule" JSONB,
    "sortStrategy" "CollectionSortStrategy" NOT NULL DEFAULT 'MANUAL',
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionTranslation" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,

    CONSTRAINT "CollectionTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionProduct" (
    "collectionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CollectionProduct_pkey" PRIMARY KEY ("collectionId","productId")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "template" TEXT NOT NULL DEFAULT 'default',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageTranslation" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImageUrl" TEXT,

    CONSTRAINT "PageTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "authorId" TEXT,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "heroImageUrl" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogPostTranslation" (
    "id" TEXT NOT NULL,
    "blogPostId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "excerpt" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImageUrl" TEXT,

    CONSTRAINT "BlogPostTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "placementKey" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BannerTranslation" (
    "id" TEXT NOT NULL,
    "bannerId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "headline" TEXT,
    "subtext" TEXT,
    "altText" TEXT,

    CONSTRAINT "BannerTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "menuKey" TEXT NOT NULL,
    "parentId" TEXT,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemTranslation" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "MenuItemTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "segmentId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "failureReason" TEXT,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneOptOut" (
    "phoneE164" TEXT NOT NULL,
    "optedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneOptOut_pkey" PRIMARY KEY ("phoneE164")
);

-- CreateTable
CREATE TABLE "OnsiteMessage" (
    "id" TEXT NOT NULL,
    "kind" "OnsiteMessageKind" NOT NULL,
    "pagePattern" TEXT,
    "segmentId" TEXT,
    "trigger" "OnsitePopupTrigger" NOT NULL DEFAULT 'IMMEDIATE',
    "delaySeconds" INTEGER,
    "linkUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnsiteMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnsiteMessageTranslation" (
    "id" TEXT NOT NULL,
    "onsiteMessageId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "headline" TEXT,
    "body" TEXT,
    "ctaLabel" TEXT,

    CONSTRAINT "OnsiteMessageTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'onsite_popup',
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "optedOutAt" TIMESTAMP(3),

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchSynonym" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "synonym" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchSynonym_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchQueryLog" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchQueryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");

-- CreateIndex
CREATE INDEX "Collection_isActive_idx" ON "Collection"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionTranslation_collectionId_locale_key" ON "CollectionTranslation"("collectionId", "locale");

-- CreateIndex
CREATE INDEX "CollectionProduct_productId_idx" ON "CollectionProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");

-- CreateIndex
CREATE INDEX "Page_status_idx" ON "Page"("status");

-- CreateIndex
CREATE INDEX "Page_publishedAt_idx" ON "Page"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PageTranslation_pageId_locale_key" ON "PageTranslation"("pageId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");

-- CreateIndex
CREATE INDEX "BlogPost_status_publishedAt_idx" ON "BlogPost"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "BlogPost_category_idx" ON "BlogPost"("category");

-- CreateIndex
CREATE UNIQUE INDEX "BlogPostTranslation_blogPostId_locale_key" ON "BlogPostTranslation"("blogPostId", "locale");

-- CreateIndex
CREATE INDEX "Banner_placementKey_isActive_order_idx" ON "Banner"("placementKey", "isActive", "order");

-- CreateIndex
CREATE UNIQUE INDEX "BannerTranslation_bannerId_locale_key" ON "BannerTranslation"("bannerId", "locale");

-- CreateIndex
CREATE INDEX "MenuItem_menuKey_parentId_order_idx" ON "MenuItem"("menuKey", "parentId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemTranslation_menuItemId_locale_key" ON "MenuItemTranslation"("menuItemId", "locale");

-- CreateIndex
CREATE INDEX "Campaign_status_scheduledAt_idx" ON "Campaign"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_contactId_key" ON "CampaignRecipient"("campaignId", "contactId");

-- CreateIndex
CREATE INDEX "OnsiteMessage_kind_isActive_idx" ON "OnsiteMessage"("kind", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "OnsiteMessageTranslation_onsiteMessageId_locale_key" ON "OnsiteMessageTranslation"("onsiteMessageId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_optedOutAt_idx" ON "NewsletterSubscriber"("optedOutAt");

-- CreateIndex
CREATE INDEX "SearchSynonym_locale_term_idx" ON "SearchSynonym"("locale", "term");

-- CreateIndex
CREATE UNIQUE INDEX "SearchSynonym_locale_term_synonym_key" ON "SearchSynonym"("locale", "term", "synonym");

-- CreateIndex
CREATE INDEX "SearchQueryLog_resultCount_createdAt_idx" ON "SearchQueryLog"("resultCount", "createdAt");

-- CreateIndex
CREATE INDEX "SearchQueryLog_term_idx" ON "SearchQueryLog"("term");

-- CreateIndex: WO-8.3's own GIN indexes — a btree index is useless for
-- @@ / ts_rank queries, and a plain b-tree LIKE scan is what this whole work
-- order exists to replace.
CREATE INDEX "ProductTranslation_searchVector_idx" ON "ProductTranslation" USING GIN ("searchVector");

-- Trigram GIN index for fuzzy/typo-tolerant matching (SearchService falls
-- back to `similarity(name, term) > threshold` when the tsquery returns few
-- or no rows).
CREATE INDEX "ProductTranslation_name_trgm_idx" ON "ProductTranslation" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Cart_guestPhone_idx" ON "Cart"("guestPhone");

-- CreateIndex
CREATE INDEX "Contact_rfmRecencyScore_rfmFrequencyScore_rfmMonetaryScore_idx" ON "Contact"("rfmRecencyScore", "rfmFrequencyScore", "rfmMonetaryScore");

-- CreateIndex
CREATE INDEX "Order_sourceCartId_idx" ON "Order"("sourceCartId");

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_incentivePromoCodeId_fkey" FOREIGN KEY ("incentivePromoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionTranslation" ADD CONSTRAINT "CollectionTranslation_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageTranslation" ADD CONSTRAINT "PageTranslation_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPostTranslation" ADD CONSTRAINT "BlogPostTranslation_blogPostId_fkey" FOREIGN KEY ("blogPostId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BannerTranslation" ADD CONSTRAINT "BannerTranslation_bannerId_fkey" FOREIGN KEY ("bannerId") REFERENCES "Banner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemTranslation" ADD CONSTRAINT "MenuItemTranslation_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnsiteMessage" ADD CONSTRAINT "OnsiteMessage_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnsiteMessageTranslation" ADD CONSTRAINT "OnsiteMessageTranslation_onsiteMessageId_fkey" FOREIGN KEY ("onsiteMessageId") REFERENCES "OnsiteMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sourceCartId_fkey" FOREIGN KEY ("sourceCartId") REFERENCES "Cart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every existing product gets a real searchVector immediately
-- rather than only after its next edit. Mirrors SearchService.reindexProduct()
-- exactly (name weight A, tags/category/brand/fabric B, description C;
-- 'english' config for en, 'simple' for everything else since Postgres ships
-- no Urdu stemmer) so the two can never silently drift.
-- A LEFT JOIN's ON clause cannot reference the UPDATE target itself (Postgres
-- rejects "pt" inside a FROM-clause JOIN condition when pt is the row being
-- updated), so the join runs in a subquery against a plain, ordinary
-- ProductTranslation reference (pt2) and the outer UPDATE matches by id.
UPDATE "ProductTranslation" pt
SET "searchVector" = sub."vector"
FROM (
  SELECT
    pt2."id" AS "pt_id",
    setweight(to_tsvector(CASE WHEN pt2."locale" = 'en' THEN 'english'::regconfig ELSE 'simple'::regconfig END, coalesce(pt2."name", '')), 'A') ||
    setweight(to_tsvector(
      CASE WHEN pt2."locale" = 'en' THEN 'english'::regconfig ELSE 'simple'::regconfig END,
      coalesce(array_to_string(p."tags", ' '), '') || ' ' || coalesce(bt."name", '') || ' ' || coalesce(ct."name", '') || ' ' || coalesce(p."fabric", '')
    ), 'B') ||
    setweight(to_tsvector(CASE WHEN pt2."locale" = 'en' THEN 'english'::regconfig ELSE 'simple'::regconfig END, coalesce(pt2."description", '')), 'C')
      AS "vector"
  FROM "ProductTranslation" pt2
  JOIN "Product" p ON p."id" = pt2."productId"
  LEFT JOIN "Brand" b ON b."id" = p."brandId"
  LEFT JOIN "BrandTranslation" bt ON bt."brandId" = b."id" AND bt."locale" = pt2."locale"
  LEFT JOIN "Category" c ON c."id" = p."categoryId"
  LEFT JOIN "CategoryTranslation" ct ON ct."categoryId" = c."id" AND ct."locale" = pt2."locale"
) sub
WHERE sub."pt_id" = pt."id";

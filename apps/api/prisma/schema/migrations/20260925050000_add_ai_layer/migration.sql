-- WO-9, docs/implementation/ai-layer/09-ai-layer.md.
-- The AI layer: usage/cost ledger and budget accounting, SEO/alt-text draft
-- queue, size-bias feedback loop, product cross-sell, demand forecast and
-- markdown-suggestion advisories, COD risk fields on Order, review
-- summaries, semantic-search embeddings (pgvector), and the WhatsApp
-- assistant's own conversation log. One migration for the whole phase, same
-- precedent as the WO-6/WO-7/WO-8 migrations.

-- pgvector (WO-9.5) — vector similarity search, no extra service. Needs
-- superuser or CREATEDB-owner privilege once per database, same idiom as
-- WO-8.3's pg_trgm.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('ALT_TEXT', 'SEO_COPY', 'SIZE_RECOMMENDATION', 'DEMAND_FORECAST', 'COD_RISK', 'SEMANTIC_SEARCH', 'VISUAL_SEARCH', 'RECOMMENDATIONS', 'WHATSAPP_ASSISTANT', 'MARKDOWN_SUGGESTION', 'REVIEW_SUMMARY', 'IMPORT_CLEANUP');

-- CreateEnum
CREATE TYPE "AiCallKind" AS ENUM ('COMPLETION', 'EMBEDDING', 'VISION');

-- CreateEnum
CREATE TYPE "AiSuggestionKind" AS ENUM ('ALT_TEXT', 'META_TITLE', 'META_DESCRIPTION', 'DESCRIPTION', 'CARE_INSTRUCTIONS');

-- CreateEnum
CREATE TYPE "AiSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProductCrossSellKind" AS ENUM ('MANUAL', 'CO_OCCURRENCE', 'EMBEDDING');

-- CreateEnum
CREATE TYPE "MarkdownSuggestionStatus" AS ENUM ('PENDING', 'CREATED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CodRiskAction" AS ENUM ('AUTO_CONFIRM', 'CONFIRMATION_CALL', 'REQUIRE_ADVANCE_PAYMENT');

-- CreateEnum
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- AlterTable
ALTER TABLE "ProductTranslation" ADD COLUMN "embedding" vector(1536);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "codRiskScore" INTEGER,
ADD COLUMN "codRiskAction" "CodRiskAction",
ADD COLUMN "codRiskComputedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "kind" "AiCallKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costPaisa" INTEGER NOT NULL DEFAULT 0,
    "succeeded" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAiSuggestion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "imageId" TEXT,
    "kind" "AiSuggestionKind" NOT NULL,
    "locale" TEXT NOT NULL,
    "suggestedText" TEXT NOT NULL,
    "status" "AiSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "ProductAiSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSizeBias" (
    "productId" TEXT NOT NULL,
    "tooSmallPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trueToSizePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tooLargePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "shift" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSizeBias_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "ProductCrossSell" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "relatedProductId" TEXT NOT NULL,
    "kind" "ProductCrossSellKind" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCrossSell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantForecast" (
    "variantId" TEXT NOT NULL,
    "forecastedDailyDemand" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seasonalFactor" DOUBLE PRECISION,
    "projectedStockoutAt" TIMESTAMP(3),
    "reasonEn" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariantForecast_pkey" PRIMARY KEY ("variantId")
);

-- CreateTable
CREATE TABLE "MarkdownSuggestion" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "discountId" TEXT,
    "suggestedBps" INTEGER NOT NULL,
    "estimatedClearancePct" DOUBLE PRECISION NOT NULL,
    "estimatedClearanceDays" INTEGER NOT NULL,
    "marginBeforePaisa" INTEGER NOT NULL,
    "marginAfterPaisa" INTEGER NOT NULL,
    "status" "MarkdownSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MarkdownSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductReviewSummary" (
    "productId" TEXT NOT NULL,
    "summaryText" TEXT NOT NULL,
    "fitSignal" TEXT,
    "qualitySignal" TEXT,
    "commonComplaints" JSONB,
    "reviewCountAtGeneration" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductReviewSummary_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "WhatsAppConversation" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handedOffToHuman" BOOLEAN NOT NULL DEFAULT false,
    "handoffReason" TEXT,
    "handedOffAt" TIMESTAMP(3),

    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsageLog_feature_createdAt_idx" ON "AiUsageLog"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

-- CreateIndex
CREATE INDEX "ProductAiSuggestion_productId_status_idx" ON "ProductAiSuggestion"("productId", "status");

-- CreateIndex
CREATE INDEX "ProductAiSuggestion_status_createdAt_idx" ON "ProductAiSuggestion"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCrossSell_productId_relatedProductId_key" ON "ProductCrossSell"("productId", "relatedProductId");

-- CreateIndex
CREATE INDEX "ProductCrossSell_relatedProductId_idx" ON "ProductCrossSell"("relatedProductId");

-- CreateIndex
CREATE INDEX "MarkdownSuggestion_variantId_status_idx" ON "MarkdownSuggestion"("variantId", "status");

-- CreateIndex
CREATE INDEX "MarkdownSuggestion_status_createdAt_idx" ON "MarkdownSuggestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_contactId_lastMessageAt_idx" ON "WhatsAppConversation"("contactId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_phoneE164_idx" ON "WhatsAppConversation"("phoneE164");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_conversationId_createdAt_idx" ON "WhatsAppMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_codRiskAction_placedAt_idx" ON "Order"("codRiskAction", "placedAt");

-- CreateIndex (WO-9.5 hybrid ranking — cosine distance, HNSW over ivfflat
-- since it needs no "lists" tuning and builds fine as embeddings arrive
-- incrementally rather than needing representative data up front)
CREATE INDEX "ProductTranslation_embedding_idx" ON "ProductTranslation" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "ProductAiSuggestion" ADD CONSTRAINT "ProductAiSuggestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAiSuggestion" ADD CONSTRAINT "ProductAiSuggestion_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "ProductImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSizeBias" ADD CONSTRAINT "ProductSizeBias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCrossSell" ADD CONSTRAINT "ProductCrossSell_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCrossSell" ADD CONSTRAINT "ProductCrossSell_relatedProductId_fkey" FOREIGN KEY ("relatedProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantForecast" ADD CONSTRAINT "VariantForecast_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkdownSuggestion" ADD CONSTRAINT "MarkdownSuggestion_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReviewSummary" ADD CONSTRAINT "ProductReviewSummary_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

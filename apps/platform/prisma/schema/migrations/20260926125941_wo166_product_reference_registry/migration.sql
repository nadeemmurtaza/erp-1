-- CreateEnum
CREATE TYPE "ProductReferenceReviewStatus" AS ENUM ('UNREVIEWED', 'CONFIRMED', 'FLAGGED');

-- CreateTable
CREATE TABLE "MarketplacePublisherCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplacePublisherCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalProductReference" (
    "id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "registeredByTenantId" TEXT NOT NULL,
    "reviewStatus" "ProductReferenceReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalProductReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalProductReferenceTranslation" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "careInstructions" TEXT,

    CONSTRAINT "GlobalProductReferenceTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalProductReferenceImage" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "altText" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GlobalProductReferenceImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalProductReferenceLink" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "variantRef" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlobalProductReferenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalProductReferenceFlag" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "flaggedByTenantId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "GlobalProductReferenceFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplacePublisherCredential_tenantId_key" ON "MarketplacePublisherCredential"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplacePublisherCredential_apiKeyHash_key" ON "MarketplacePublisherCredential"("apiKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalProductReference_barcode_key" ON "GlobalProductReference"("barcode");

-- CreateIndex
CREATE INDEX "GlobalProductReference_registeredByTenantId_idx" ON "GlobalProductReference"("registeredByTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalProductReferenceTranslation_referenceId_locale_key" ON "GlobalProductReferenceTranslation"("referenceId", "locale");

-- CreateIndex
CREATE INDEX "GlobalProductReferenceImage_referenceId_idx" ON "GlobalProductReferenceImage"("referenceId");

-- CreateIndex
CREATE INDEX "GlobalProductReferenceLink_referenceId_idx" ON "GlobalProductReferenceLink"("referenceId");

-- CreateIndex
CREATE INDEX "GlobalProductReferenceLink_tenantId_idx" ON "GlobalProductReferenceLink"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalProductReferenceLink_tenantId_variantRef_key" ON "GlobalProductReferenceLink"("tenantId", "variantRef");

-- CreateIndex
CREATE INDEX "GlobalProductReferenceFlag_referenceId_idx" ON "GlobalProductReferenceFlag"("referenceId");

-- AddForeignKey
ALTER TABLE "MarketplacePublisherCredential" ADD CONSTRAINT "MarketplacePublisherCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalProductReference" ADD CONSTRAINT "GlobalProductReference_registeredByTenantId_fkey" FOREIGN KEY ("registeredByTenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalProductReferenceTranslation" ADD CONSTRAINT "GlobalProductReferenceTranslation_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "GlobalProductReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalProductReferenceImage" ADD CONSTRAINT "GlobalProductReferenceImage_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "GlobalProductReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalProductReferenceLink" ADD CONSTRAINT "GlobalProductReferenceLink_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "GlobalProductReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalProductReferenceLink" ADD CONSTRAINT "GlobalProductReferenceLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalProductReferenceFlag" ADD CONSTRAINT "GlobalProductReferenceFlag_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "GlobalProductReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalProductReferenceFlag" ADD CONSTRAINT "GlobalProductReferenceFlag_flaggedByTenantId_fkey" FOREIGN KEY ("flaggedByTenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

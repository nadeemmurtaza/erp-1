-- CreateEnum
CREATE TYPE "MarketplaceListingKind" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "MarketplaceAudience" AS ENUM ('RETAILER', 'DISTRIBUTOR', 'SUPPLIER', 'DIRECT_CUSTOMER');

-- CreateEnum
CREATE TYPE "MarketplaceListingStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DELISTED');

-- CreateEnum
CREATE TYPE "MarketplaceEngagementMode" AS ENUM ('DISCOVERY_ONLY', 'DISCOVERY_AND_TRANSACT');

-- CreateEnum
CREATE TYPE "MarketplaceEngagementKind" AS ENUM ('INQUIRY', 'ORDER_REQUEST');

-- CreateEnum
CREATE TYPE "MarketplaceEngagementStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "MarketplaceListingKind" NOT NULL,
    "externalRef" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceMinorUnits" INTEGER,
    "currency" TEXT,
    "imageUrl" TEXT,
    "visibleTo" "MarketplaceAudience"[],
    "engagementMode" "MarketplaceEngagementMode" NOT NULL DEFAULT 'DISCOVERY_ONLY',
    "status" "MarketplaceListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceViewerProfile" (
    "id" TEXT NOT NULL,
    "nidSubjectId" TEXT NOT NULL,
    "declaredType" "MarketplaceAudience" NOT NULL,
    "verifiedType" "MarketplaceAudience",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceViewerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceEngagement" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "viewerProfileId" TEXT NOT NULL,
    "kind" "MarketplaceEngagementKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "MarketplaceEngagementStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "MarketplaceEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketplaceListing_status_kind_idx" ON "MarketplaceListing"("status", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_tenantId_externalRef_key" ON "MarketplaceListing"("tenantId", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceViewerProfile_nidSubjectId_key" ON "MarketplaceViewerProfile"("nidSubjectId");

-- CreateIndex
CREATE INDEX "MarketplaceEngagement_listingId_status_idx" ON "MarketplaceEngagement"("listingId", "status");

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PlatformTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceEngagement" ADD CONSTRAINT "MarketplaceEngagement_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceEngagement" ADD CONSTRAINT "MarketplaceEngagement_viewerProfileId_fkey" FOREIGN KEY ("viewerProfileId") REFERENCES "MarketplaceViewerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

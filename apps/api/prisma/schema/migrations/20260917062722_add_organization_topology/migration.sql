-- CreateEnum
CREATE TYPE "AdminScopeLevel" AS ENUM ('ORG', 'BRAND', 'BRANCH');

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "originNodeId" TEXT,
ADD COLUMN     "retailBrandId" TEXT;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailBrand" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandPolicy" (
    "id" TEXT NOT NULL,
    "retailBrandId" TEXT NOT NULL,
    "allowBranchProductCreation" BOOLEAN NOT NULL DEFAULT false,
    "allowBranchLocalPurchasing" BOOLEAN NOT NULL DEFAULT false,
    "allowInterBranchTransfers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminScope" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "AdminScopeLevel" NOT NULL,
    "retailBrandId" TEXT,
    "branchNodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetailBrand_slug_key" ON "RetailBrand"("slug");

-- CreateIndex
CREATE INDEX "RetailBrand_organizationId_idx" ON "RetailBrand"("organizationId");

-- CreateIndex
CREATE INDEX "RetailBrand_parentId_idx" ON "RetailBrand"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandPolicy_retailBrandId_key" ON "BrandPolicy"("retailBrandId");

-- CreateIndex
CREATE INDEX "AdminScope_userId_idx" ON "AdminScope"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminScope_userId_level_retailBrandId_branchNodeId_key" ON "AdminScope"("userId", "level", "retailBrandId", "branchNodeId");

-- CreateIndex
CREATE INDEX "Location_retailBrandId_idx" ON "Location"("retailBrandId");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_retailBrandId_fkey" FOREIGN KEY ("retailBrandId") REFERENCES "RetailBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailBrand" ADD CONSTRAINT "RetailBrand_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailBrand" ADD CONSTRAINT "RetailBrand_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "RetailBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandPolicy" ADD CONSTRAINT "BrandPolicy_retailBrandId_fkey" FOREIGN KEY ("retailBrandId") REFERENCES "RetailBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminScope" ADD CONSTRAINT "AdminScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminScope" ADD CONSTRAINT "AdminScope_retailBrandId_fkey" FOREIGN KEY ("retailBrandId") REFERENCES "RetailBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminScope" ADD CONSTRAINT "AdminScope_branchNodeId_fkey" FOREIGN KEY ("branchNodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

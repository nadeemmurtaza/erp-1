-- CreateEnum
CREATE TYPE "OrderItemFulfillmentStatus" AS ENUM ('READY', 'AWAITING_STOCK', 'AWAITING_PRODUCTION');

-- CreateEnum
CREATE TYPE "PartyRoleName" AS ENUM ('SUPPLIER', 'MANUFACTURER', 'DISTRIBUTOR', 'RETAILER');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'RELEASED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkOrderSource" AS ENUM ('REORDER', 'ORDER_CASCADE', 'MANUAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementReason" ADD VALUE 'PRODUCTION_CONSUMPTION';
ALTER TYPE "StockMovementReason" ADD VALUE 'PRODUCTION_RECEIPT';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "awaitingSince" TIMESTAMP(3),
ADD COLUMN     "fulfillmentStatus" "OrderItemFulfillmentStatus" NOT NULL DEFAULT 'READY';

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "producedInHouse" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "partyId" TEXT;

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "taxId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "externalRef" TEXT,
    "externalSystem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyRoleAssignment" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "role" "PartyRoleName" NOT NULL,

    CONSTRAINT "PartyRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillOfMaterial" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillOfMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillOfMaterialLine" (
    "id" TEXT NOT NULL,
    "billOfMaterialId" TEXT NOT NULL,
    "componentVariantId" TEXT NOT NULL,
    "quantityPerUnit" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BillOfMaterialLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantityOrdered" INTEGER NOT NULL,
    "quantityCompleted" INTEGER NOT NULL DEFAULT 0,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "WorkOrderSource" NOT NULL,
    "sourceRefType" TEXT,
    "sourceRefId" TEXT,
    "locationId" TEXT,
    "notes" TEXT,
    "releasedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderNumberCounter" (
    "year" INTEGER NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkOrderNumberCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE INDEX "Party_phone_idx" ON "Party"("phone");

-- CreateIndex
CREATE INDEX "Party_taxId_idx" ON "Party"("taxId");

-- CreateIndex
CREATE UNIQUE INDEX "PartyRoleAssignment_partyId_role_key" ON "PartyRoleAssignment"("partyId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "BillOfMaterial_variantId_key" ON "BillOfMaterial"("variantId");

-- CreateIndex
CREATE INDEX "BillOfMaterialLine_componentVariantId_idx" ON "BillOfMaterialLine"("componentVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "BillOfMaterialLine_billOfMaterialId_componentVariantId_key" ON "BillOfMaterialLine"("billOfMaterialId", "componentVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_number_key" ON "WorkOrder"("number");

-- CreateIndex
CREATE INDEX "WorkOrder_status_createdAt_idx" ON "WorkOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WorkOrder_variantId_idx" ON "WorkOrder"("variantId");

-- CreateIndex
CREATE INDEX "WorkOrder_sourceRefType_sourceRefId_idx" ON "WorkOrder"("sourceRefType", "sourceRefId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_partyId_key" ON "Supplier"("partyId");

-- AddForeignKey
ALTER TABLE "PartyRoleAssignment" ADD CONSTRAINT "PartyRoleAssignment_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillOfMaterial" ADD CONSTRAINT "BillOfMaterial_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillOfMaterialLine" ADD CONSTRAINT "BillOfMaterialLine_billOfMaterialId_fkey" FOREIGN KEY ("billOfMaterialId") REFERENCES "BillOfMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillOfMaterialLine" ADD CONSTRAINT "BillOfMaterialLine_componentVariantId_fkey" FOREIGN KEY ("componentVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;


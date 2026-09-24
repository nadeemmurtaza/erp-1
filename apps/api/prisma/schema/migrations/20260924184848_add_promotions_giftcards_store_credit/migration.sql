-- Phase 5 (docs/implementation/05-promotions-giftcards.md WO-5.1/5.2/5.3/5.4/5.5):
-- discount rules + promo codes (Discount, PromoCode, OrderDiscount), gift
-- cards (GiftCard, GiftCardTransaction) and the store-credit ledger
-- (StoreCreditTransaction, plus User.storeCreditBalance as its cache — see
-- StoreCreditTransaction's own doc comment in giftcards.prisma for why the
-- ledger, not the column, is the source of truth).

-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING', 'BUY_X_GET_Y', 'TIERED');

-- CreateEnum
CREATE TYPE "DiscountScope" AS ENUM ('ORDER', 'PRODUCT', 'CATEGORY', 'COLLECTION', 'SHIPPING');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "storeCreditBalance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "initialValue" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "status" "GiftCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "purchasedByUserId" TEXT,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "recipientPhone" TEXT,
    "message" TEXT,
    "sourceOrderId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardTransaction" (
    "id" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCardTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreCreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreCreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "scope" "DiscountScope" NOT NULL DEFAULT 'ORDER',
    "value" INTEGER NOT NULL,
    "maxDiscount" INTEGER,
    "minSubtotal" INTEGER,
    "minQuantity" INTEGER,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customerSegmentId" TEXT,
    "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
    "buyQuantity" INTEGER,
    "getQuantity" INTEGER,
    "getDiscountBps" INTEGER,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isStackable" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "usageLimit" INTEGER,
    "usageLimitPerUser" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "restrictedToUserId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDiscount" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "discountId" TEXT,
    "promoCodeId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_code_key" ON "GiftCard"("code");

-- CreateIndex
CREATE INDEX "GiftCard_status_idx" ON "GiftCard"("status");

-- CreateIndex
CREATE INDEX "GiftCard_purchasedByUserId_idx" ON "GiftCard"("purchasedByUserId");

-- CreateIndex
CREATE INDEX "GiftCardTransaction_giftCardId_createdAt_idx" ON "GiftCardTransaction"("giftCardId", "createdAt");

-- CreateIndex
CREATE INDEX "GiftCardTransaction_orderId_idx" ON "GiftCardTransaction"("orderId");

-- CreateIndex
CREATE INDEX "StoreCreditTransaction_userId_createdAt_idx" ON "StoreCreditTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StoreCreditTransaction_orderId_idx" ON "StoreCreditTransaction"("orderId");

-- CreateIndex
CREATE INDEX "Discount_isActive_startsAt_endsAt_idx" ON "Discount"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCode_discountId_idx" ON "PromoCode"("discountId");

-- CreateIndex
CREATE INDEX "PromoCode_batchId_idx" ON "PromoCode"("batchId");

-- CreateIndex
CREATE INDEX "OrderDiscount_orderId_idx" ON "OrderDiscount"("orderId");

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_purchasedByUserId_fkey" FOREIGN KEY ("purchasedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardTransaction" ADD CONSTRAINT "GiftCardTransaction_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardTransaction" ADD CONSTRAINT "GiftCardTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCreditTransaction" ADD CONSTRAINT "StoreCreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCreditTransaction" ADD CONSTRAINT "StoreCreditTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDiscount" ADD CONSTRAINT "OrderDiscount_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDiscount" ADD CONSTRAINT "OrderDiscount_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "incentiveSentAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "reviewRequestSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "replenishmentReminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isConsumable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "marketingEmailOptOut" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "InboundEmailReply" (
    "id" TEXT NOT NULL,
    "inboundEmailId" TEXT NOT NULL,
    "actorId" TEXT,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundEmailReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboundEmailReply_inboundEmailId_sentAt_idx" ON "InboundEmailReply"("inboundEmailId", "sentAt");

-- AddForeignKey
ALTER TABLE "InboundEmailReply" ADD CONSTRAINT "InboundEmailReply_inboundEmailId_fkey" FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEmailReply" ADD CONSTRAINT "InboundEmailReply_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

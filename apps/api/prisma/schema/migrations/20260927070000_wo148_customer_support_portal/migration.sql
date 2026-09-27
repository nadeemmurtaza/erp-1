-- External (customer-facing) support ticketing — doc 64's own named,
-- unbuilt gap. tasks-notifications-support/148-external-customer-support-
-- portal.md (WO-148.1), DECISIONS.md ADR-065.
--
-- Hand-written, forward-only (ADR-008). Purely additive. No organizationId
-- anywhere (ADR-040/ADR-044/ADR-046/ADR-049/ADR-060/ADR-062/ADR-064): this
-- deployment IS the tenant boundary. contactId, never userId, for the
-- requester — a genuinely different actor model from SupportTicket
-- (doc 64), per this document's own central answer.

-- CreateEnum
CREATE TYPE "CustomerTicketStatus" AS ENUM ('OPEN', 'AWAITING_CUSTOMER', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportMessageAuthorType" AS ENUM ('CUSTOMER', 'STAFF');

-- CreateTable
CREATE TABLE "CustomerSupportTicket" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "orderId" TEXT,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "CustomerTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "assignedToUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerSupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorType" "SupportMessageAuthorType" NOT NULL,
    "contactId" TEXT,
    "userId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerSupportTicket_status_assignedToUserId_idx" ON "CustomerSupportTicket"("status", "assignedToUserId");

-- CreateIndex
CREATE INDEX "CustomerSupportTicket_contactId_idx" ON "CustomerSupportTicket"("contactId");

-- CreateIndex
CREATE INDEX "CustomerSupportMessage_ticketId_createdAt_idx" ON "CustomerSupportMessage"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerSupportMessage" ADD CONSTRAINT "CustomerSupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "CustomerSupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

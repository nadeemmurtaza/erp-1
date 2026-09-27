-- Internal notifications, meetings and escalation.
-- tasks-notifications-support/24-internal-notifications-meetings-escalation.md
-- (WO-24.1/24.3/24.4/24.5), DECISIONS.md ADR-058.
--
-- Hand-written, forward-only (ADR-008). Purely additive. No organizationId
-- anywhere (ADR-040/ADR-044/ADR-046/ADR-049): this deployment IS the tenant
-- boundary; EscalationRule.sourceType is unique alone.

-- AlterEnum
ALTER TYPE "ApprovalSubjectType" ADD VALUE 'BROADCAST_MESSAGE';

-- CreateEnum
CREATE TYPE "InviteResponse" AS ENUM ('NO_RESPONSE', 'ACCEPTED', 'DECLINED', 'TENTATIVE');

-- CreateTable
CREATE TABLE "Audience" (
    "id" TEXT NOT NULL,
    "orgUnitId" TEXT,
    "includeDescendants" BOOLEAN NOT NULL DEFAULT true,
    "minRankLevel" INTEGER,
    "positionIds" TEXT[],
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Audience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastMessage" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "excludedCount" INTEGER NOT NULL DEFAULT 0,
    "approvalChainId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "location" TEXT,
    "audienceId" TEXT NOT NULL,
    "calledByUserId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingInvitation" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "response" "InviteResponse" NOT NULL DEFAULT 'NO_RESPONSE',
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationRule" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "afterMinutes" INTEGER NOT NULL,
    "stepsPerFire" INTEGER NOT NULL DEFAULT 1,
    "ceilingRankLevel" INTEGER,
    "maxFires" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "EscalationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationFire" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "fireNumber" INTEGER NOT NULL,
    "climbedToPositionId" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscalationFire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Audience_orgUnitId_idx" ON "Audience"("orgUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastMessage_approvalChainId_key" ON "BroadcastMessage"("approvalChainId");

-- CreateIndex
CREATE INDEX "BroadcastMessage_senderId_createdAt_idx" ON "BroadcastMessage"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "Meeting_orgUnitId_startsAt_idx" ON "Meeting"("orgUnitId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingInvitation_meetingId_userId_key" ON "MeetingInvitation"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "MeetingInvitation_userId_response_idx" ON "MeetingInvitation"("userId", "response");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationRule_sourceType_key" ON "EscalationRule"("sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationFire_taskId_fireNumber_key" ON "EscalationFire"("taskId", "fireNumber");

-- CreateIndex
CREATE INDEX "EscalationFire_taskId_idx" ON "EscalationFire"("taskId");

-- AddForeignKey
ALTER TABLE "BroadcastMessage" ADD CONSTRAINT "BroadcastMessage_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "Audience"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "Audience"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingInvitation" ADD CONSTRAINT "MeetingInvitation_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationFire" ADD CONSTRAINT "EscalationFire_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "EscalationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

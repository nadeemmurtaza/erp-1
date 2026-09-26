-- Positions and the rank ladder: EmployeeProfile, Rank, Position, Posting —
-- docs/implementation/hr-people-org/20-people-positions-ranks.md (WO-20.1),
-- DECISIONS.md ADR-044.
--
-- Hand-written, forward-only (ADR-008). Purely additive. No Employee table:
-- Posting keys straight to "User" (ADR-044) — the identical actor-modelling
-- call this schema's own AssetAssignment/CompensationRate already made.

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'LEFT');

-- CreateTable
CREATE TABLE "EmployeeProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "status" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedOn" TIMESTAMP(3) NOT NULL,
    "leftOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rank" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "level" INTEGER NOT NULL,

    CONSTRAINT "Rank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "rankId" TEXT NOT NULL,
    "reportsToId" TEXT,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Posting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "startedOn" TIMESTAMP(3) NOT NULL,
    "endedOn" TIMESTAMP(3),

    CONSTRAINT "Posting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_userId_key" ON "EmployeeProfile"("userId");
CREATE UNIQUE INDEX "EmployeeProfile_employeeCode_key" ON "EmployeeProfile"("employeeCode");
CREATE INDEX "EmployeeProfile_status_idx" ON "EmployeeProfile"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Rank_key_key" ON "Rank"("key");
CREATE UNIQUE INDEX "Rank_level_key" ON "Rank"("level");

-- CreateIndex
CREATE INDEX "Position_orgUnitId_idx" ON "Position"("orgUnitId");
CREATE INDEX "Position_reportsToId_idx" ON "Position"("reportsToId");

-- CreateIndex
CREATE INDEX "Posting_userId_endedOn_idx" ON "Posting"("userId", "endedOn");
CREATE INDEX "Posting_positionId_endedOn_idx" ON "Posting"("positionId", "endedOn");

-- CreateIndex — "at most one primary posting per user at a time" is a
-- temporal constraint no composite unique can express (doc 20, "The
-- unique that Postgres cannot express"). This covers the open case; an
-- overlapping *closed* primary is refused by PostingService.assign(), the
-- sole writer, proven by a spec.
CREATE UNIQUE INDEX "posting_one_primary_open" ON "Posting" ("userId") WHERE "isPrimary" AND "endedOn" IS NULL;

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Position" ADD CONSTRAINT "Position_rankId_fkey" FOREIGN KEY ("rankId") REFERENCES "Rank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Position" ADD CONSTRAINT "Position_reportsToId_fkey" FOREIGN KEY ("reportsToId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

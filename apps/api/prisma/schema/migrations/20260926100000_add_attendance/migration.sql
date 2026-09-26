-- Attendance, shifts and leave —
-- docs/implementation/attendance-workforce/22-attendance-shifts-leave.md
-- (WO-22.1), DECISIONS.md ADR-046.
--
-- Hand-written, forward-only (ADR-008). AttendanceEvent is
-- PARTITION BY RANGE (occurredAt) from this first migration — "the one
-- table in this set that must be designed for the volume on day one"
-- (100k employees punching four times a day is ~150M rows/year). Postgres
-- requires the primary key on a partitioned table to include the partition
-- key, so the key here is the composite (id, occurredAt).

-- CreateEnum
CREATE TYPE "AttendanceKind" AS ENUM ('IN', 'OUT', 'BREAK_START', 'BREAK_END', 'ADJUSTMENT');
CREATE TYPE "AttendanceSource" AS ENUM ('DEVICE', 'SELF', 'MANAGER', 'IMPORT');
CREATE TYPE "AttendanceDeviceStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
CREATE TYPE "AttendanceExceptionReason" AS ENUM ('NO_MATCHING_SHIFT', 'OUTSIDE_ROSTER', 'WRONG_UNIT', 'WHILE_ON_LEAVE', 'DUPLICATE_SUSPECTED', 'MISSING_COUNTERPART');

-- CreateTable
CREATE TABLE "AttendanceDevice" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "deviceKeyHash" TEXT,
    "status" "AttendanceDeviceStatus" NOT NULL DEFAULT 'PENDING',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDevice_code_key" ON "AttendanceDevice"("code");
CREATE UNIQUE INDEX "AttendanceDevice_deviceKeyHash_key" ON "AttendanceDevice"("deviceKeyHash");
CREATE INDEX "AttendanceDevice_orgUnitId_idx" ON "AttendanceDevice"("orgUnitId");
CREATE INDEX "AttendanceDevice_status_idx" ON "AttendanceDevice"("status");

-- AddForeignKey
ALTER TABLE "AttendanceDevice" ADD CONSTRAINT "AttendanceDevice_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable (partitioned parent — no rows can be inserted until a
-- partition covering their occurredAt exists; the DEFAULT partition below
-- guarantees one always does)
CREATE TABLE "AttendanceEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AttendanceKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "source" "AttendanceSource" NOT NULL,
    "deviceId" TEXT,
    "correctsId" TEXT,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id", "occurredAt")
) PARTITION BY RANGE ("occurredAt");

-- Monthly partitions: 3 months back through 9 months ahead (12 total).
-- AttendancePartitionCron creates each new month several months ahead of
-- time in normal operation; the DEFAULT partition below is what keeps "a
-- punch is never refused" true even if that maintenance ever falls behind.
DO $$
DECLARE
  month_start date := (date_trunc('month', now()) - interval '3 months')::date;
  month_end date;
  partition_name text;
BEGIN
  FOR i IN 0..11 LOOP
    month_end := (month_start + interval '1 month')::date;
    partition_name := 'AttendanceEvent_' || to_char(month_start, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF "AttendanceEvent" FOR VALUES FROM (%L) TO (%L)',
      partition_name, month_start, month_end
    );
    month_start := month_end;
  END LOOP;
END $$;

-- CreateTable
CREATE TABLE "AttendanceEvent_default" PARTITION OF "AttendanceEvent" DEFAULT;

-- CreateIndex — a partitioned unique index; Postgres requires it to include
-- the partition key (occurredAt), which it does. A genuine replay of the
-- same punch carries the identical occurredAt the device sent the first
-- time, so this is not a weaker guarantee in practice (doc 22's own
-- "second copy of the write" lens).
CREATE UNIQUE INDEX "AttendanceEvent_userId_source_externalRef_occurredAt_key" ON "AttendanceEvent"("userId", "source", "externalRef", "occurredAt");
CREATE INDEX "AttendanceEvent_userId_occurredAt_idx" ON "AttendanceEvent"("userId", "occurredAt");
CREATE INDEX "AttendanceEvent_orgUnitId_occurredAt_idx" ON "AttendanceEvent"("orgUnitId", "occurredAt");
CREATE INDEX "AttendanceEvent_id_idx" ON "AttendanceEvent"("id");

-- AddForeignKey — referencing a partitioned table's own composite primary
-- key is supported (Postgres 12+); referencing `id` alone would not be.
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AttendanceDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shift_userId_startsAt_idx" ON "Shift"("userId", "startsAt");
CREATE INDEX "Shift_orgUnitId_startsAt_idx" ON "Shift"("orgUnitId", "startsAt");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AttendanceException" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventOccurredAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "reason" "AttendanceExceptionReason" NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceException_resolvedAt_idx" ON "AttendanceException"("resolvedAt");
CREATE INDEX "AttendanceException_userId_idx" ON "AttendanceException"("userId");
CREATE INDEX "AttendanceException_orgUnitId_idx" ON "AttendanceException"("orgUnitId");

-- AddForeignKey — a real, DB-enforced two-column FK against AttendanceEvent's
-- own composite primary key (not a bare scalar): see attendance.prisma's
-- own header for why this differs from AttendanceEvent.correctsId.
ALTER TABLE "AttendanceException" ADD CONSTRAINT "AttendanceException_eventId_eventOccurredAt_fkey" FOREIGN KEY ("eventId", "eventOccurredAt") REFERENCES "AttendanceEvent"("id", "occurredAt") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceException" ADD CONSTRAINT "AttendanceException_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceException" ADD CONSTRAINT "AttendanceException_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

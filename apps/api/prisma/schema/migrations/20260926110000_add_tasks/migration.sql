-- Task allotment, status and tracking: Task, TaskTransition,
-- TaskStageDefinition —
-- docs/implementation/tasks-notifications-support/23-tasks-allotment-tracking.md
-- (WO-23.1), DECISIONS.md ADR-049.
--
-- Hand-written, forward-only (ADR-008). Purely additive. No Employee table:
-- Task.assigneeUserId keys straight to "User" as a bare scalar (ADR-044,
-- ADR-049) — no FK, the same "erasure the ledger cannot obey" choice already
-- made for TaskTransition.byUserId and Task.createdByUserId below.
-- TaskStageDefinition carries no organizationId (ADR-049 — the identical
-- correction ADR-040/ADR-044/ADR-046 already make for the same reason).

-- CreateEnum
CREATE TYPE "TaskState" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "positionId" TEXT NOT NULL,
    "assigneeUserId" TEXT,
    "orgUnitId" TEXT NOT NULL,
    "state" "TaskState" NOT NULL DEFAULT 'OPEN',
    "stageId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "sourceType" TEXT,
    "sourceId" TEXT,
    "sourceRef" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTransition" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromState" "TaskState",
    "toState" "TaskState" NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT,
    "byUserId" TEXT,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskStageDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "TaskStageDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — a redelivered domain event must not raise a second task
-- (WO-23.3); both columns NULL for a hand-created task, the same NULL
-- exemption every composite unique in this schema carries.
CREATE UNIQUE INDEX "Task_sourceType_sourceRef_key" ON "Task"("sourceType", "sourceRef");
CREATE INDEX "Task_positionId_state_idx" ON "Task"("positionId", "state");
CREATE INDEX "Task_assigneeUserId_state_idx" ON "Task"("assigneeUserId", "state");
CREATE INDEX "Task_orgUnitId_state_idx" ON "Task"("orgUnitId", "state");
CREATE INDEX "Task_dueAt_idx" ON "Task"("dueAt");

-- CreateIndex
CREATE INDEX "TaskTransition_taskId_occurredAt_idx" ON "TaskTransition"("taskId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskStageDefinition_key_key" ON "TaskStageDefinition"("key");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTransition" ADD CONSTRAINT "TaskTransition_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

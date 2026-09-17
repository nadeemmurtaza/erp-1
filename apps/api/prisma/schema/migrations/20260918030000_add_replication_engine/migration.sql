-- CreateEnum
CREATE TYPE "ReplicationClass" AS ENUM ('FACT', 'POLICY');

-- CreateEnum
CREATE TYPE "ReplicationDirection" AS ENUM ('UP', 'DOWN');

-- CreateEnum
CREATE TYPE "ReplicationOp" AS ENUM ('UPSERT', 'DELETE');

-- CreateEnum
CREATE TYPE "ReplicationQuarantineStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "ReplicationRecord" (
    "id" TEXT NOT NULL,
    "originNodeId" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "dataClass" "ReplicationClass" NOT NULL,
    "direction" "ReplicationDirection" NOT NULL,
    "op" "ReplicationOp" NOT NULL,
    "payload" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplicationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReplicationRecord_originNodeId_sequence_key" ON "ReplicationRecord"("originNodeId", "sequence");

-- CreateIndex
CREATE INDEX "ReplicationRecord_entity_entityId_idx" ON "ReplicationRecord"("entity", "entityId");

-- CreateTable
CREATE TABLE "ReplicationSequenceCounter" (
    "nodeId" TEXT NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "ReplicationSequenceCounter_pkey" PRIMARY KEY ("nodeId")
);

-- CreateTable
CREATE TABLE "ReplicationCursor" (
    "peerNodeId" TEXT NOT NULL,
    "lastSequence" BIGINT NOT NULL,
    "lastSyncAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplicationCursor_pkey" PRIMARY KEY ("peerNodeId")
);

-- CreateTable
CREATE TABLE "ReplicationQuarantine" (
    "id" TEXT NOT NULL,
    "originNodeId" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "op" "ReplicationOp" NOT NULL,
    "payload" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReplicationQuarantineStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReplicationQuarantine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReplicationQuarantine_status_idx" ON "ReplicationQuarantine"("status");

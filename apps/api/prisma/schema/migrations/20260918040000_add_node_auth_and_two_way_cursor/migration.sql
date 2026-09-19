-- AlterTable
ALTER TABLE "Node" ADD COLUMN     "inboundApiKeyHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Node_inboundApiKeyHash_key" ON "Node"("inboundApiKeyHash");

-- Table is empty (nothing writes to it yet — WO-20.1) — dropped and
-- recreated with a composite key rather than migrated in place.
DROP TABLE "ReplicationCursor";

-- CreateTable
CREATE TABLE "ReplicationCursor" (
    "peerNodeId" TEXT NOT NULL,
    "direction" "ReplicationDirection" NOT NULL,
    "lastSequence" BIGINT NOT NULL,
    "lastSyncAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplicationCursor_pkey" PRIMARY KEY ("peerNodeId", "direction")
);

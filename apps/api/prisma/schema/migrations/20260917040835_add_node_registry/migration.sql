-- CreateEnum
CREATE TYPE "NodeRole" AS ENUM ('BRANCH', 'BRAND');

-- CreateEnum
CREATE TYPE "NodeStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "Node" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "role" "NodeRole" NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "NodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Node_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Node_nodeId_key" ON "Node"("nodeId");

-- CreateIndex
CREATE INDEX "Node_role_idx" ON "Node"("role");

-- CreateIndex
CREATE INDEX "Node_status_idx" ON "Node"("status");

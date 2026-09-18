-- CreateEnum
CREATE TYPE "PosTerminalStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "PosTerminal" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "deviceKeyHash" TEXT,
    "status" "PosTerminalStatus" NOT NULL DEFAULT 'PENDING',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosTerminal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosTerminal_code_key" ON "PosTerminal"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PosTerminal_deviceKeyHash_key" ON "PosTerminal"("deviceKeyHash");

-- CreateIndex
CREATE INDEX "PosTerminal_locationId_idx" ON "PosTerminal"("locationId");

-- CreateIndex
CREATE INDEX "PosTerminal_status_idx" ON "PosTerminal"("status");

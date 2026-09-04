-- CreateEnum
CREATE TYPE "EmailAccountPurpose" AS ENUM ('TRANSACTIONAL', 'MARKETING', 'SUPPORT');

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "purpose" "EmailAccountPurpose" NOT NULL DEFAULT 'TRANSACTIONAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "replyTo" TEXT,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUser" TEXT NOT NULL,
    "smtpPasswordEncrypted" TEXT NOT NULL,
    "smtpVerifiedAt" TIMESTAMP(3),
    "imapHost" TEXT,
    "imapPort" INTEGER,
    "imapSecure" BOOLEAN NOT NULL DEFAULT true,
    "imapUser" TEXT,
    "imapPasswordEncrypted" TEXT,
    "imapVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailAccount_purpose_isActive_idx" ON "EmailAccount"("purpose", "isActive");

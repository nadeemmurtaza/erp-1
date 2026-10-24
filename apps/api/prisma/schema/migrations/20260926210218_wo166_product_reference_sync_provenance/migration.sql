-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "sourcedFromGlobalReferenceId" TEXT;

-- AlterTable
ALTER TABLE "ProductTranslation" ADD COLUMN     "sourcedFromGlobalReferenceId" TEXT,
ADD COLUMN     "sourcedFromReferenceUpdatedAt" TIMESTAMP(3);

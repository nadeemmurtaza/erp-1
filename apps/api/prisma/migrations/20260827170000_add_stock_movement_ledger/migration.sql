CREATE TYPE "StockMovementReason" AS ENUM ('PURCHASE_RECEIPT', 'SALE', 'CANCELLATION', 'RETURN', 'ADJUSTMENT', 'DAMAGE', 'COUNT', 'WRITE_OFF');

CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "resultingStock" INTEGER NOT NULL,
    "reason" "StockMovementReason" NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "unitCost" INTEGER,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockMovement_variantId_createdAt_idx" ON "StockMovement"("variantId", "createdAt");
CREATE INDEX "StockMovement_reason_createdAt_idx" ON "StockMovement"("reason", "createdAt");
CREATE INDEX "StockMovement_refType_refId_idx" ON "StockMovement"("refType", "refId");

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "StockMovement"
  (id, "variantId", delta, "resultingStock", reason, note, "actorId", "createdAt")
SELECT id, "variantId", delta, "resultingStock", 
       CASE WHEN reason = 'damaged' THEN 'DAMAGE'::"StockMovementReason" ELSE 'ADJUSTMENT'::"StockMovementReason" END,
       CASE WHEN reason = 'damaged' THEN note ELSE 
         CASE WHEN note IS NOT NULL THEN 'legacy reason: ' || reason || ' - ' || note ELSE 'legacy reason: ' || reason END 
       END,
       "actorId", "createdAt"
FROM "StockAdjustment";

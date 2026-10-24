-- Phase 6 (docs/implementation/06-shipping-fulfilment-returns.md) — shipping
-- as data instead of the `shipping.zones` JSON Setting, the shipment
-- lifecycle (methods, manifests, tracking events), and returns/RMA.
--
-- WO-6.1's own instruction: "Migrate the existing setting into rows in the
-- same migration... the new module must produce byte-identical fees for the
-- existing zones on day one." The backfill at the bottom seeds exactly the
-- three zones `settings.defaults.ts` shipped (karachi/punjab/rest_of_pakistan)
-- as one "standard" ShippingMethod with a FLAT rate per zone, fee and
-- freeAbove copied verbatim — asserted against by
-- shipping-migration.spec.ts. Per-zone ETA ranges do not carry over
-- byte-identically: the new model puts ETA on the METHOD, not the zone (a
-- method serves every zone), so the backfill uses one method-level ETA
-- spanning the old per-zone ranges. Nothing reads ETA for pricing, so this
-- does not affect the fee acceptance test.

-- CreateEnum
CREATE TYPE "ShippingRateType" AS ENUM ('FLAT', 'BY_WEIGHT', 'BY_PRICE', 'BY_ITEM');

-- CreateEnum
CREATE TYPE "ManifestStatus" AS ENUM ('OPEN', 'DISPATCHED');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTED', 'REFUNDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReturnResolution" AS ENUM ('REFUND', 'EXCHANGE', 'STORE_CREDIT', 'REPAIR', 'REJECTED');

-- CreateTable
CREATE TABLE "ShippingZone" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCatchAll" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingZoneTranslation" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ShippingZoneTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingMethod" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "courierKey" TEXT,
    "etaMinDays" INTEGER NOT NULL DEFAULT 2,
    "etaMaxDays" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingMethodTranslation" (
    "id" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ShippingMethodTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "type" "ShippingRateType" NOT NULL DEFAULT 'FLAT',
    "fee" INTEGER NOT NULL,
    "baseFee" INTEGER NOT NULL DEFAULT 0,
    "includedUnits" INTEGER NOT NULL DEFAULT 0,
    "freeAbove" INTEGER,
    "minValue" INTEGER,
    "maxValue" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingClass" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "handlingFee" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingClassTranslation" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ShippingClassTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Manifest" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "courierKey" TEXT NOT NULL,
    "status" "ManifestStatus" NOT NULL DEFAULT 'OPEN',
    "dispatchedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Manifest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentItem" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "rawStatus" TEXT,
    "meta" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnReasonCode" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReturnReasonCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnReasonTranslation" (
    "id" TEXT NOT NULL,
    "reasonId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ReturnReasonTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "resolution" "ReturnResolution",
    "customerNote" TEXT,
    "staffNote" TEXT,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "inspectedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "refundAmount" INTEGER,

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnRequestItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "reasonId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "restockable" BOOLEAN,
    "restocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReturnRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnRequestNumberCounter" (
    "year" INTEGER NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReturnRequestNumberCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "ManifestNumberCounter" (
    "year" INTEGER NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ManifestNumberCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShippingZone_key_key" ON "ShippingZone"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingZoneTranslation_zoneId_locale_key" ON "ShippingZoneTranslation"("zoneId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingMethod_key_key" ON "ShippingMethod"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingMethodTranslation_methodId_locale_key" ON "ShippingMethodTranslation"("methodId", "locale");

-- CreateIndex
CREATE INDEX "ShippingRate_zoneId_methodId_idx" ON "ShippingRate"("zoneId", "methodId");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingClass_key_key" ON "ShippingClass"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingClassTranslation_classId_locale_key" ON "ShippingClassTranslation"("classId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Manifest_number_key" ON "Manifest"("number");

-- CreateIndex
CREATE INDEX "Manifest_courierKey_status_idx" ON "Manifest"("courierKey", "status");

-- CreateIndex
CREATE INDEX "ShipmentItem_shipmentId_idx" ON "ShipmentItem"("shipmentId");

-- CreateIndex
CREATE INDEX "ShipmentItem_orderItemId_idx" ON "ShipmentItem"("orderItemId");

-- CreateIndex
CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_idx" ON "ShipmentEvent"("shipmentId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnReasonCode_key_key" ON "ReturnReasonCode"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnReasonTranslation_reasonId_locale_key" ON "ReturnReasonTranslation"("reasonId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRequest_number_key" ON "ReturnRequest"("number");

-- CreateIndex
CREATE INDEX "ReturnRequest_status_requestedAt_idx" ON "ReturnRequest"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");

-- CreateIndex
CREATE INDEX "ReturnRequestItem_returnId_idx" ON "ReturnRequestItem"("returnId");

-- CreateIndex
CREATE INDEX "ReturnRequestItem_orderItemId_idx" ON "ReturnRequestItem"("orderItemId");

-- AddForeignKey
ALTER TABLE "ShippingZoneTranslation" ADD CONSTRAINT "ShippingZoneTranslation_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "ShippingZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingMethodTranslation" ADD CONSTRAINT "ShippingMethodTranslation_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "ShippingMethod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "ShippingZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "ShippingMethod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingClassTranslation" ADD CONSTRAINT "ShippingClassTranslation_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ShippingClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Manifest" ADD CONSTRAINT "Manifest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnReasonTranslation" ADD CONSTRAINT "ReturnReasonTranslation_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "ReturnReasonCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequestItem" ADD CONSTRAINT "ReturnRequestItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequestItem" ADD CONSTRAINT "ReturnRequestItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequestItem" ADD CONSTRAINT "ReturnRequestItem_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "ReturnReasonCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Shipment (WO-6.4's extension fields)
ALTER TABLE "Shipment"
  ADD COLUMN "methodId" TEXT,
  ADD COLUMN "weightGrams" INTEGER,
  ADD COLUMN "packageCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "labelUrl" TEXT,
  ADD COLUMN "manifestId" TEXT,
  ADD COLUMN "meta" JSONB,
  ADD COLUMN "isRto" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "rtoAt" TIMESTAMP(3),
  ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastPolledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_manifestId_idx" ON "Shipment"("manifestId");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "ShippingMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "Manifest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Product (WO-6.1's own closing line — per-product shipping class)
ALTER TABLE "Product" ADD COLUMN "shippingClassId" TEXT;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_shippingClassId_fkey" FOREIGN KEY ("shippingClassId") REFERENCES "ShippingClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Contact (WO-6.7's own RTO counter)
ALTER TABLE "Contact" ADD COLUMN "rtoCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill: the three zones settings.defaults.ts shipped, as rows, with one
-- "standard" ShippingMethod and a FLAT rate per zone. Fee and freeAbove are
-- copied verbatim (in paisa) so quote() produces byte-identical fees to the
-- old resolveShippingZone()+computeShippingFee() path it replaces.
INSERT INTO "ShippingMethod" ("id", "key", "etaMinDays", "etaMaxDays", "order", "updatedAt")
VALUES ('smethod_standard', 'standard', 1, 6, 0, CURRENT_TIMESTAMP);

INSERT INTO "ShippingMethodTranslation" ("id", "methodId", "locale", "label")
VALUES
  ('smethodtr_standard_en', 'smethod_standard', 'en', 'Standard delivery'),
  ('smethodtr_standard_ur', 'smethod_standard', 'ur', 'معیاری ترسیل');

INSERT INTO "ShippingZone" ("id", "key", "order", "cities", "isCatchAll", "updatedAt")
VALUES
  ('szone_karachi', 'karachi', 0, ARRAY['karachi'], false, CURRENT_TIMESTAMP),
  ('szone_punjab', 'punjab', 1, ARRAY['lahore', 'islamabad', 'rawalpindi', 'faisalabad', 'multan', 'gujranwala'], false, CURRENT_TIMESTAMP),
  ('szone_rest_of_pakistan', 'rest_of_pakistan', 2, ARRAY[]::TEXT[], true, CURRENT_TIMESTAMP);

INSERT INTO "ShippingZoneTranslation" ("id", "zoneId", "locale", "label")
VALUES
  ('szonetr_karachi_en', 'szone_karachi', 'en', 'Karachi'),
  ('szonetr_karachi_ur', 'szone_karachi', 'ur', 'کراچی'),
  ('szonetr_punjab_en', 'szone_punjab', 'en', 'Punjab & Islamabad'),
  ('szonetr_punjab_ur', 'szone_punjab', 'ur', 'پنجاب و اسلام آباد'),
  ('szonetr_rop_en', 'szone_rest_of_pakistan', 'en', 'Rest of Pakistan'),
  ('szonetr_rop_ur', 'szone_rest_of_pakistan', 'ur', 'باقی پاکستان');

INSERT INTO "ShippingRate" ("id", "zoneId", "methodId", "type", "fee", "freeAbove")
VALUES
  ('srate_karachi_standard', 'szone_karachi', 'smethod_standard', 'FLAT', 15000, 300000),
  ('srate_punjab_standard', 'szone_punjab', 'smethod_standard', 'FLAT', 20000, 400000),
  ('srate_rop_standard', 'szone_rest_of_pakistan', 'smethod_standard', 'FLAT', 25000, 500000);

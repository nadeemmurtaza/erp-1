-- Location.type, which RETAIL-ERP.md R4 turns on: an in-transit bucket is a
-- Location, not a flag on a transfer. Everything VariantLocationStock and the
-- stock ledger already do for a real location then comes free for goods on a
-- truck, with no further schema change.
--
-- STORE is the default because every existing row is a real, staffed place —
-- a single-location shop has exactly one, created by the B6 backfill, and must
-- keep behaving identically after this migration.

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('STORE', 'WAREHOUSE', 'IN_TRANSIT');

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "type" "LocationType" NOT NULL DEFAULT 'STORE';

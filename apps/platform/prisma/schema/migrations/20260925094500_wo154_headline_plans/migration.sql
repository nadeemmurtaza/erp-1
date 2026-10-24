-- WO-154.1 (docs/implementation/commercial-licensing-agency/
-- 154-three-headline-commercial-plans.md), ADR-040 — pure packaging of
-- doc 50/153's own existing PricingModel shapes onto a public pricing-
-- comparison page. No new PricingModel value, no new billing mechanism:
-- every column below is additive to the ALREADY-authoritative
-- `PlatformPlan` row, never a second "which plans are headline" table.

-- AlterTable: PlatformPlan — isHeadline/headlineOrder are doc 154 §3's own
-- literal schema; both default to a plan not appearing on the comparison
-- page at all, so an existing row is unaffected until an admin opts it in.
ALTER TABLE "PlatformPlan" ADD COLUMN "isHeadline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformPlan" ADD COLUMN "headlineOrder" INTEGER;

-- AlterTable: PlatformPlan — public-facing copy (ADR-040). Doc 154 §3's own
-- `getPlanComparison()` sketch reads `displayName`/`priceDescription`/
-- `bestFor`/`ctaLabel` off a `PlatformPlan` row; no such columns existed
-- before this migration. Nullable: most plans (PER_SEAT, anything never
-- marked headline) carry no public copy at all, and null is exactly that
-- — "this plan has no customer-facing pricing-page copy" — never "unset,
-- fall back to a hardcoded default naming the plan," which is the literal
-- hardcoding Law 1 forbids for a fact that must never drift from what
-- billing actually charges.
ALTER TABLE "PlatformPlan" ADD COLUMN "displayName" TEXT;
ALTER TABLE "PlatformPlan" ADD COLUMN "priceDescription" TEXT;
ALTER TABLE "PlatformPlan" ADD COLUMN "bestFor" TEXT;
ALTER TABLE "PlatformPlan" ADD COLUMN "ctaLabel" TEXT;

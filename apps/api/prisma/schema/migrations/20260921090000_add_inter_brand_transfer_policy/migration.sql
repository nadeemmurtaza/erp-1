-- WO-22.2: inter-brand transfers through the organization tier.
--
-- RETAIL-ERP.md R9 requires a permissive policy switch to start closed, the
-- same convention BrandPolicy's three flags already follow: a deployment that
-- upgrades into an Organization tier must not silently acquire the ability to
-- move stock between brands because a column appeared. DEFAULT false is that
-- rule expressed in the migration, and it is also the correct value for every
-- existing row — no deployment has an inter-brand transfer today.
--
-- Only an Organization-edition deployment's ORG-tier database holds an
-- Organization row at all; a Chain-edition one has none, and a BRAND-tier
-- deployment knows its organization only through PARENT_URL. The column is
-- therefore harmless where the table is empty, which is most deployments.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "allowInterBrandTransfers" BOOLEAN NOT NULL DEFAULT false;

-- launchpad-apps/234-auction-app.md (WO-234.6) — the permission that guards
-- settlements, reaching a live Admin role on a deployment that already seeded.
--
-- Why a migration and not only ROLE_PERMISSION_SEED.ADMIN: the same reason as
-- 20261003100100_wo234_5_bidders_permission. seedPermissions() writes the
-- legacy RolePermission rows, which PermissionsResolverService never reads, and
-- seedRoles() copies them into live RoleGrant rows once, then returns as soon as
-- any Role exists. On an existing deployment the new key would reach nobody.
--
-- Idempotent and safe on every database:
--  * the Permission row is inserted only when missing (the seed upserts the
--    label and category on its next run either way);
--  * a RoleGrant goes to the Role named 'Admin' only for a permission that has
--    no RoleGrant yet, so a later edit by an administrator is never overridden;
--  * on a fresh database Role is empty, so the grant does nothing and the seed's
--    one-time copy handles it. A renamed Admin role is skipped.

INSERT INTO "Permission" ("id", "key", "label", "category") VALUES
  (gen_random_uuid()::text, 'auction.settle', 'See what auction winners owe, replay an invoice, cancel an unpaid win, and offer a lot to the next bidder', 'Sales')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RoleGrant" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."key" = 'auction.settle'
WHERE r."name" = 'Admin'
  AND NOT EXISTS (SELECT 1 FROM "RoleGrant" g WHERE g."permissionId" = p."id")
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- launchpad-apps/234-auction-app.md (WO-234.1) — the three auction permission
-- keys, reaching a live Admin role on a deployment that already seeded.
--
-- Why a migration and not only ROLE_PERMISSION_SEED.ADMIN: the seed's
-- seedPermissions() writes the legacy RolePermission rows, which
-- PermissionsResolverService never reads, and seedRoles() copies them into
-- live RoleGrant rows once, then returns as soon as any Role exists. On an
-- existing deployment the new keys would therefore reach nobody. This is the
-- gap CLAUDE.md names; doc 187 closes it the same way.
--
-- Idempotent and safe on every database:
--  * Permission rows are inserted only when missing (the seed upserts the
--    label and category on its next run either way).
--  * A RoleGrant goes to the Role named 'Admin' only for a permission that has
--    no RoleGrant yet — the seed's own "a brand-new permission picks up its
--    defaults, an admin's later edits are never overridden" rule.
--  * On a fresh database Role is empty, so the grant statement does nothing and
--    the seed's one-time copy handles it. A renamed Admin role is skipped.

INSERT INTO "Permission" ("id", "key", "label", "category") VALUES
  (gen_random_uuid()::text, 'auction.view', 'View auctions and their lots', 'Sales'),
  (gen_random_uuid()::text, 'auction.manage', 'Create and edit auctions and lots, and cancel an auction before it opens', 'Sales'),
  (gen_random_uuid()::text, 'auction.publish', 'Schedule an auction so it opens to bidding at its start time', 'Sales')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RoleGrant" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."key" IN ('auction.view', 'auction.manage', 'auction.publish')
WHERE r."name" = 'Admin'
  AND NOT EXISTS (SELECT 1 FROM "RoleGrant" g WHERE g."permissionId" = p."id")
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

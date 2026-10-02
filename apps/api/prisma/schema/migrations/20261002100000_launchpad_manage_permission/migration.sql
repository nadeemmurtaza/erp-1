-- launchpad-apps/232-launchpad-and-app-manifest.md §6/§13: `launchpad.manage`
-- switches a launchpad app on or off for the whole tenant.
--
-- Why a migration at all: `seedPermissions()` only creates the Permission row and
-- the legacy enum-keyed grants, and `seedRoles()` is strictly one-time, so on a
-- deployment whose `Role` rows already exist a new catalogue key reaches NO role
-- until something grants it (the catalogue-vs-roles trap CLAUDE.md names). This
-- grants it to the seeded `Admin` role only, matching ROLE_PERMISSION_SEED.ADMIN,
-- and nobody else.
--
-- Additive, idempotent, forward-only, no schema change. A fresh database has no
-- `Role` rows yet at this point, so the grant statement matches nothing there and
-- `seedRoles()` copies the grant from the legacy rows instead. A deployment that
-- renamed or deleted `Admin` is untouched: it grants the key itself from
-- /admin/settings.

INSERT INTO "Permission" ("id", "key", "label", "category")
VALUES (
  'perm_launchpad_manage',
  'launchpad.manage',
  'Switch launchpad apps on or off for the whole organization',
  'Administration'
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RoleGrant" ("id", "roleId", "permissionId")
SELECT 'rg_launchpad_manage_' || r."id", r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."key" = 'launchpad.manage'
WHERE r."name" = 'Admin'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

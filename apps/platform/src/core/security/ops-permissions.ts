/**
 * The control plane's own small permission catalog — deliberately NOT
 * `packages/shared/src/permissions.ts`, which is apps/api's tenant-facing
 * PBAC catalog, seeded against that app's own User/Role/RolePermission
 * tables. This is a different trust boundary (hosting-ops staff/tooling,
 * never a tenant's own user), so per the shared-infrastructure/isolated-
 * data decision it gets its own, smaller vocabulary rather than being
 * folded into a catalog that belongs to a different database entirely.
 *
 * Matches doc 39's own permission names (WO-39.8).
 */
export const PLATFORM_PERMISSIONS = [
  'platform.tenants.manage',
  'platform.tenants.provision',
  'platform.support.grant_access',
  'platform.support.approve_dedicated_access',
  'platform.billing.manage',
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

/**
 * The control plane's own small permission catalog — deliberately NOT
 * `packages/shared/src/permissions.ts`, which is apps/api's tenant-facing
 * PBAC catalog, seeded against that app's own User/Role/RolePermission
 * tables. This is a different trust boundary (hosting-ops staff/tooling,
 * never a tenant's own user), so per the shared-infrastructure/isolated-
 * data decision it gets its own, smaller vocabulary rather than being
 * folded into a catalog that belongs to a different database entirely.
 *
 * Matches doc 39's own permission names (WO-39.8), plus WO-51.5's
 * `platform.trials.extend` — deliberately narrower than
 * `platform.tenants.manage` so a sales/support role can push a trial's
 * `trialExpiresAt` forward without also being able to suspend, reactivate
 * or deprovision a paying tenant.
 */
export const PLATFORM_PERMISSIONS = [
  'platform.tenants.manage',
  'platform.tenants.provision',
  'platform.support.grant_access',
  'platform.support.approve_dedicated_access',
  'platform.billing.manage',
  /**
   * doc 153 WO-153.4 — approving a rate-card change on a live USAGE_BASED
   * plan above `PLATFORM_RATE_CARD_APPROVAL_THRESHOLD_BPS`. Deliberately
   * narrower than `platform.billing.manage` (which can propose a change,
   * issue invoices, credit-note one) so proposing and approving a rate
   * change are two different keys, matching doc 145's own credit-limit
   * create/approve split and doc 50's own custom-quote one.
   */
  'platform.billing.approve',
  'platform.trials.extend',
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

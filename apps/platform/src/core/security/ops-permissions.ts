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
  /**
   * doc 14 (commercial-licensing-agency/14-managed-services-module.md) —
   * registering an existing `PlatformTenant` for the agency managed-
   * services dashboard (issuing its `AGENCY_API_KEY`, rotating it, linking
   * a Stripe customer/subscription). Deliberately narrower than
   * `platform.tenants.manage`: suspending/reactivating/deprovisioning a
   * tenant is unchanged and stays gated by that key — this one only
   * governs the agency-onboarding fields ADR-039 added to that same row.
   */
  'platform.agency.manage',
  /**
   * Docs 165/166 — issuing/rotating a tenant's own
   * `MarketplacePublisherCredential` for the cross-tenant marketplace/
   * product-reference network. Deliberately its own key, not folded into
   * `platform.tenants.manage`: this only ever mints or rotates a key on an
   * existing tenant (identical "never creates a new entity" shape ADR-039
   * already established for `platform.agency.manage`), and never touches
   * that tenant's own status/suspension.
   */
  'platform.marketplace.manage',
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

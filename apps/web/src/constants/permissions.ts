/**
 * Permission keys, re-exported from the shared catalogue.
 *
 * The definitions live in @newax/shared because the API is what enforces
 * them — a key the UI knows about but the server does not is a button that
 * 403s, and a key the server has but the UI does not is a capability nobody
 * can reach. One list, both ends.
 *
 * This file exists so `constants/` is where you look for permission keys, the
 * same way you look there for routes. It adds no values of its own; if you
 * are adding a permission, add it to the catalogue in shared.
 *
 * The personal-API-key lists (163-personal-api-keys.md) come through here for
 * the same reason: what a key may carry is a permission question, and the
 * picker must offer exactly what the server will accept.
 */
export {
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  PERMISSION_GROUPS,
  ADMIN_LOCKED_PERMISSIONS,
  ROLE_PERMISSION_SEED,
  NON_DELEGATABLE_PERMISSIONS,
  CUSTOMER_SCOPE_CATALOG,
  CUSTOMER_SCOPE_RESOURCES,
  API_KEY_LIFETIME_OPTIONS_DAYS,
  API_KEY_DEFAULT_LIFETIME_DAYS,
  delegatablePermissionsOf,
  isDelegatablePermission,
  nonDelegatableReason,
  type PermissionKey,
  type PermissionDefinition,
  type PermissionGroup,
  type PermissionSensitivity,
  type CustomerScopeKey,
  type CustomerScopeResource,
} from '@newax/shared';

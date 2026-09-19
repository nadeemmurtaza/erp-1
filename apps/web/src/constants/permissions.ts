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
 */
export {
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  PERMISSION_GROUPS,
  ADMIN_LOCKED_PERMISSIONS,
  ROLE_PERMISSION_SEED,
  type PermissionKey,
  type PermissionDefinition,
  type PermissionGroup,
  type PermissionSensitivity,
} from '@newax/shared';

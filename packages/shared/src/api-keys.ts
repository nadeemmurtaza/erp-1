/**
 * Personal API keys — what a key may carry, and the pure rules deciding what
 * it may do on a given request.
 * docs/implementation/access-control-identity/163-personal-api-keys.md.
 *
 * A key belongs to the person who made it and acts as them, never as anyone
 * more powerful: on every request its effective access is
 *
 *   (the scopes chosen when it was made) ∩ (its owner's live permissions)
 *     − NON_DELEGATABLE_PERMISSIONS
 *
 * recomputed from the database, never snapshotted — so a demoted owner's keys
 * shrink on their next request with nothing to remember or clean up.
 *
 * Lives in @newax/shared because both ends need the same answer (House Rule
 * 11): the API enforces these lists and rules; the admin and storefront
 * screens render their pickers from them. A permission the picker offers is,
 * by construction, one the server accepts. One list, both ends.
 */

import { PERMISSION_KEYS, type PermissionKey } from './permissions';

/**
 * Which request surface a key acts on. Two distinct scope catalogues — an
 * ADMIN key carries `PERMISSION_CATALOG` keys and is checked against
 * `@RequirePermission`; a STOREFRONT key carries `CUSTOMER_SCOPE_CATALOG` keys
 * and is checked against `@CustomerScope` on the customer's own routes. A key
 * never crosses surfaces.
 */
export const API_KEY_SURFACES = ['ADMIN', 'STOREFRONT'] as const;
export type ApiKeySurface = (typeof API_KEY_SURFACES)[number];

/**
 * The first characters of every raw key, by surface — so a leaked key says
 * which surface it opens, and a secret scanner can match it.
 *
 * `nx` is Newax's own prefix — Law 1's one exception, never the client's
 * brand — so a rebrand never renames a credential somebody has already pasted
 * into a script.
 */
export const API_KEY_PREFIXES: Readonly<Record<ApiKeySurface, string>> = {
  ADMIN: 'nxa',
  STOREFRONT: 'nxs',
};

/**
 * Which surface a raw bearer credential claims to be, read off its prefix —
 * or null for anything else (a session's JWT always starts `eyJ`). Only a
 * claim: the guard checks it against the stored row and refuses a mismatch.
 */
export function apiKeySurfaceOf(raw: string): ApiKeySurface | null {
  for (const surface of API_KEY_SURFACES) {
    if (raw.startsWith(`${API_KEY_PREFIXES[surface]}_`)) return surface;
  }
  return null;
}

/**
 * How long a key lives, in days. Mandatory: a key with no end date is a grant
 * nobody remembers to end. The ceiling is a security control, not a business
 * rule, so it is a constant here rather than a `Setting` a Settings holder
 * could quietly raise — changing it is a reviewed commit.
 */
export const API_KEY_LIFETIME_OPTIONS_DAYS = [7, 30, 90, 180, 365] as const;
export const API_KEY_DEFAULT_LIFETIME_DAYS = 90;
export const API_KEY_MAX_LIFETIME_DAYS = 365;

/**
 * Live keys one person may hold on one surface. It bounds table growth and
 * what a briefly-stolen session can mint in a loop; it is not a security
 * invariant on its own, so two concurrent creates landing one key over it is
 * harmless and is not locked against.
 */
export const API_KEY_MAX_ACTIVE_PER_SURFACE = 20;

export const API_KEY_NAME_MAX_LENGTH = 80;

// ─── The admin surface: what can never be delegated ────────────────────────

export interface NonDelegatablePermission {
  key: PermissionKey;
  /** One sentence, shown beside the permission in the key picker. */
  reason: string;
}

/**
 * Permissions that can never be put in an API key, by anyone, whatever else
 * they hold.
 *
 * The criterion is escalation, deliberately not `PermissionDefinition
 * .sensitivity`: that tag says how bad it is to grant something to the wrong
 * person; this list says whether a key holding it could take more access
 * than it was given — by editing grants, by minting a principal or a
 * credential that outlives the key, or by taking over the account itself.
 * Refunds are `high` and exactly what an integration may need; creating a
 * user is also `high` and must never be delegatable.
 *
 * Keep it short. Every entry is a capability no integration can have, so an
 * entry needs a reason a reviewer can check against what the permission's
 * routes actually do — doc 163 §3 lists, with reasons, what was considered and
 * left off.
 *
 * Enforced three times: refused at create and edit (ApiKeysService),
 * stripped from the effective set on every request
 * (`effectiveApiKeyPermissions` below — so adding an entry here disables it
 * in every existing key on its next request, with no migration), and the
 * credential-minting routes these gate are `@SessionOnly()` besides.
 */
export const NON_DELEGATABLE_PERMISSIONS: readonly NonDelegatablePermission[] = [
  {
    key: 'roles.manage_permissions',
    reason:
      "Edits any role's grants, including a role this key's owner holds — a key carrying it could add any permission to that role, and so to itself.",
  },
  {
    key: 'users.manage',
    reason:
      "Creates accounts with a password the caller chooses, assigns roles and personal overrides, and resets other people's passwords — each one mints or widens access outside the key.",
  },
  {
    key: 'organization.manage',
    reason:
      "Grants who is a brand or branch admin, and rotates a branch node's replication credential — a credential that outlives the key and its owner.",
  },
  {
    key: 'settings.manage',
    reason:
      "Controls the store's mailboxes: repointing the transactional mailbox would deliver every password-reset link, an admin's included, to whoever holds the key.",
  },
  {
    key: 'settings.sso.manage',
    reason:
      'Decides which identity provider may sign people in and which role new sign-ins get: a provider trusted for a domain signs in, and links, every account at that domain, an admin’s included — account takeover by configuration.',
  },
  {
    key: 'pos.manage',
    reason:
      'Issues till device credentials — a second credential that would survive this key being revoked and its owner being deactivated.',
  },
  {
    key: 'account.change_own_password',
    reason: "The account's own sign-in credential. A key is a revocable slice of an account and must never be able to take it over.",
  },
];

const NON_DELEGATABLE_KEYS: ReadonlySet<string> = new Set(NON_DELEGATABLE_PERMISSIONS.map((entry) => entry.key));

export function isDelegatablePermission(key: string): boolean {
  return !NON_DELEGATABLE_KEYS.has(key);
}

/** The recorded reason `key` can never be in an API key, or null when it can. */
export function nonDelegatableReason(key: string): string | null {
  return NON_DELEGATABLE_PERMISSIONS.find((entry) => entry.key === key)?.reason ?? null;
}

/**
 * What an ADMIN key may actually do on this request: its stored permission
 * keys, kept only where its owner holds them right now and they may be
 * delegated at all. Deduplicated, in the key's own order.
 *
 * Pure — the caller resolves `ownerLivePermissions` fresh
 * (`PermissionsResolverService.resolveForUser`) on every request. The same
 * function drives the owner's own list, which shows which of a key's
 * permissions are currently paused, so what the screen says and what the
 * guard enforces cannot disagree.
 */
export function effectiveApiKeyPermissions(
  keyPermissions: readonly string[],
  ownerLivePermissions: readonly string[],
): string[] {
  const live = new Set(ownerLivePermissions);
  const effective: string[] = [];
  for (const key of keyPermissions) {
    if (live.has(key) && !NON_DELEGATABLE_KEYS.has(key) && !effective.includes(key)) {
      effective.push(key);
    }
  }
  return effective;
}

export type ApiKeyPermissionRefusal = 'UNKNOWN' | 'NON_DELEGATABLE' | 'NOT_HELD';

/**
 * Why each requested permission may not go into a key right now — empty when
 * every one may. Used at create and at edit: a key is only ever granted what
 * its owner holds at that moment and may delegate.
 */
export function refuseApiKeyPermissions(
  requested: readonly string[],
  ownerLivePermissions: readonly string[],
): Array<{ key: string; refusal: ApiKeyPermissionRefusal }> {
  const known = new Set<string>(PERMISSION_KEYS);
  const live = new Set(ownerLivePermissions);
  const refusals: Array<{ key: string; refusal: ApiKeyPermissionRefusal }> = [];

  for (const key of new Set(requested)) {
    if (!known.has(key)) refusals.push({ key, refusal: 'UNKNOWN' });
    else if (NON_DELEGATABLE_KEYS.has(key)) refusals.push({ key, refusal: 'NON_DELEGATABLE' });
    else if (!live.has(key)) refusals.push({ key, refusal: 'NOT_HELD' });
  }

  return refusals;
}

/** What this person could put in an admin key right now — the picker's options, in catalogue order. */
export function delegatablePermissionsOf(heldPermissions: readonly string[]): PermissionKey[] {
  const held = new Set(heldPermissions);
  return PERMISSION_KEYS.filter((key) => held.has(key) && !NON_DELEGATABLE_KEYS.has(key));
}

// ─── The storefront surface: the customer scope catalogue ─────────────────

/**
 * The resources a storefront key can reach — each one a customer's own rows
 * behind a self-service route that already exists. Nothing here invents a
 * capability; doc 163 §4 lists every customer route that was deliberately
 * left out (profile edits, devices, notification preferences, identity
 * verification, gift-card codes, point redemption, cart and checkout) and
 * why.
 */
export const CUSTOMER_SCOPE_RESOURCES = [
  'profile',
  'orders',
  'addresses',
  'measurements',
  'wishlist',
  'reviews',
  'returns',
  'loyalty',
  'store-credit',
] as const;
export type CustomerScopeResource = (typeof CUSTOMER_SCOPE_RESOURCES)[number];
export type CustomerScopeAccess = 'read' | 'write';

export interface CustomerScopeDefinition {
  key: `${CustomerScopeResource}:${CustomerScopeAccess}`;
  resource: CustomerScopeResource;
  access: CustomerScopeAccess;
  /**
   * English, for the API documentation and the admin oversight list. The
   * storefront renders its own translated wording (messages/*.json,
   * `account.apiKeys`), so this is never shown to a customer.
   */
  label: string;
  /**
   * The API module whose routes the scope reaches. The storefront picker
   * hides a scope whose module is off for this deployment (MOD-1) — the
   * scope would grant nothing, because its routes are not mounted. Omitted
   * where the routes live in an always-on module.
   */
  module?: string;
}

/**
 * The storefront's scope vocabulary. `write` always implies `read` of the
 * same resource (`expandCustomerScopes`), so a route that only reads
 * declares only the read scope.
 */
export const CUSTOMER_SCOPE_CATALOG = [
  { key: 'profile:read', resource: 'profile', access: 'read', label: 'Read your name, email address and phone number' },
  { key: 'orders:read', resource: 'orders', access: 'read', label: 'Read your orders', module: 'orders' },
  { key: 'addresses:read', resource: 'addresses', access: 'read', label: 'Read your saved addresses' },
  { key: 'addresses:write', resource: 'addresses', access: 'write', label: 'Add, edit and remove your saved addresses' },
  { key: 'measurements:read', resource: 'measurements', access: 'read', label: 'Read your measurement profiles', module: 'measurements' },
  {
    key: 'measurements:write',
    resource: 'measurements',
    access: 'write',
    label: 'Save, edit and remove your measurement profiles',
    module: 'measurements',
  },
  { key: 'wishlist:read', resource: 'wishlist', access: 'read', label: 'Read your wishlist and back-in-stock alerts', module: 'wishlist' },
  {
    key: 'wishlist:write',
    resource: 'wishlist',
    access: 'write',
    label: 'Save and remove wishlist items and back-in-stock alerts',
    module: 'wishlist',
  },
  { key: 'reviews:read', resource: 'reviews', access: 'read', label: 'Read your own reviews', module: 'reviews' },
  { key: 'reviews:write', resource: 'reviews', access: 'write', label: 'Submit a review — moderated before it shows', module: 'reviews' },
  { key: 'returns:read', resource: 'returns', access: 'read', label: 'Read your return requests', module: 'fulfilment' },
  { key: 'returns:write', resource: 'returns', access: 'write', label: 'Request a return and upload its photos', module: 'fulfilment' },
  { key: 'loyalty:read', resource: 'loyalty', access: 'read', label: 'Read your points, tier, history and referral code', module: 'loyalty' },
  { key: 'store-credit:read', resource: 'store-credit', access: 'read', label: 'Read your store credit balance and history', module: 'giftcards' },
] as const satisfies readonly CustomerScopeDefinition[];

export type CustomerScopeKey = (typeof CUSTOMER_SCOPE_CATALOG)[number]['key'];

export const CUSTOMER_SCOPE_KEYS: readonly CustomerScopeKey[] = CUSTOMER_SCOPE_CATALOG.map((scope) => scope.key);

const CUSTOMER_SCOPE_BY_KEY: ReadonlyMap<string, CustomerScopeDefinition> = new Map(
  CUSTOMER_SCOPE_CATALOG.map((scope): [string, CustomerScopeDefinition] => [scope.key, scope]),
);

/**
 * A storefront key's stored scopes as the guard reads them: unknown strings
 * dropped (a scope retired from the catalogue stops working on the next
 * request, with no migration), duplicates removed, and every `write` scope
 * bringing its resource's `read` scope with it — a key that may edit your
 * addresses may list them. Catalogue order.
 */
export function expandCustomerScopes(scopes: readonly string[]): CustomerScopeKey[] {
  const granted = new Set<string>();
  for (const key of scopes) {
    const scope = CUSTOMER_SCOPE_BY_KEY.get(key);
    if (!scope) continue;
    granted.add(scope.key);
    if (scope.access === 'write') granted.add(`${scope.resource}:read`);
  }
  return CUSTOMER_SCOPE_KEYS.filter((key) => granted.has(key));
}

/** Requested scopes the catalogue does not know — refused at create and edit. */
export function unknownCustomerScopes(requested: readonly string[]): string[] {
  return [...new Set(requested)].filter((key) => !CUSTOMER_SCOPE_BY_KEY.has(key));
}

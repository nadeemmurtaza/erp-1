import {
  API_KEY_DEFAULT_LIFETIME_DAYS,
  API_KEY_LIFETIME_OPTIONS_DAYS,
  API_KEY_MAX_LIFETIME_DAYS,
  API_KEY_PREFIXES,
  API_KEY_SURFACES,
  CUSTOMER_SCOPE_CATALOG,
  CUSTOMER_SCOPE_KEYS,
  CUSTOMER_SCOPE_RESOURCES,
  NON_DELEGATABLE_PERMISSIONS,
  apiKeySurfaceOf,
  delegatablePermissionsOf,
  effectiveApiKeyPermissions,
  expandCustomerScopes,
  isDelegatablePermission,
  nonDelegatableReason,
  refuseApiKeyPermissions,
  unknownCustomerScopes,
} from './api-keys';
import { ADMIN_LOCKED_PERMISSIONS, PERMISSION_KEYS } from './permissions';

describe('NON_DELEGATABLE_PERMISSIONS', () => {
  it('names only real catalogue keys — a typo would silently delegate the permission it meant to lock', () => {
    for (const entry of NON_DELEGATABLE_PERMISSIONS) {
      expect(PERMISSION_KEYS).toContain(entry.key);
    }
  });

  it('gives every entry a reason a reviewer can check', () => {
    for (const entry of NON_DELEGATABLE_PERMISSIONS) {
      expect(entry.reason.trim().length).toBeGreaterThan(20);
    }
  });

  it('lists each permission once', () => {
    const keys = NON_DELEGATABLE_PERMISSIONS.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('contains every lockout-critical permission — a key must never hold one', () => {
    for (const key of ADMIN_LOCKED_PERMISSIONS) {
      expect(isDelegatablePermission(key)).toBe(false);
    }
  });

  it('covers managing users, roles and access grants, and the account’s own credential', () => {
    for (const key of ['users.manage', 'roles.manage_permissions', 'organization.manage', 'account.change_own_password']) {
      expect(isDelegatablePermission(key)).toBe(false);
    }
  });

  it('leaves money capabilities an integration legitimately needs delegatable', () => {
    for (const key of ['payments.approve', 'giftcards.manage', 'orders.manage', 'purchasing.manage']) {
      expect(isDelegatablePermission(key)).toBe(true);
    }
  });

  it('returns the recorded reason, or null for a delegatable permission', () => {
    expect(nonDelegatableReason('users.manage')).toMatch(/password/);
    expect(nonDelegatableReason('orders.manage')).toBeNull();
  });
});

describe('effectiveApiKeyPermissions — a key never exceeds its owner', () => {
  it('keeps only what the owner holds right now', () => {
    expect(effectiveApiKeyPermissions(['orders.manage', 'catalog.manage'], ['orders.manage'])).toEqual(['orders.manage']);
  });

  it('shrinks to nothing when the owner holds nothing — a demoted or stripped owner', () => {
    expect(effectiveApiKeyPermissions(['orders.manage', 'catalog.manage'], [])).toEqual([]);
  });

  it('never grants a permission the key did not carry, however much the owner holds', () => {
    expect(effectiveApiKeyPermissions(['orders.manage'], ['orders.manage', 'catalog.manage', 'finance.view'])).toEqual([
      'orders.manage',
    ]);
  });

  it('strips a non-delegatable permission even when the key carries it and the owner holds it', () => {
    // A row written before the permission joined the list: it stops working on
    // the next request, with no migration.
    expect(effectiveApiKeyPermissions(['users.manage', 'orders.manage'], ['users.manage', 'orders.manage'])).toEqual([
      'orders.manage',
    ]);
  });

  it('deduplicates and keeps the key’s own order', () => {
    expect(
      effectiveApiKeyPermissions(['reports.view', 'orders.manage', 'reports.view'], ['orders.manage', 'reports.view']),
    ).toEqual(['reports.view', 'orders.manage']);
  });

  it('ignores an unknown string the owner cannot hold', () => {
    expect(effectiveApiKeyPermissions(['not.a.permission'], ['orders.manage'])).toEqual([]);
  });
});

describe('refuseApiKeyPermissions — what may go into a key at create and at edit', () => {
  it('accepts a held, delegatable permission', () => {
    expect(refuseApiKeyPermissions(['orders.manage'], ['orders.manage'])).toEqual([]);
  });

  it('refuses a permission the owner does not hold', () => {
    expect(refuseApiKeyPermissions(['finance.manage'], ['orders.manage'])).toEqual([
      { key: 'finance.manage', refusal: 'NOT_HELD' },
    ]);
  });

  it('refuses a non-delegatable permission even when the owner holds it', () => {
    expect(refuseApiKeyPermissions(['roles.manage_permissions'], ['roles.manage_permissions'])).toEqual([
      { key: 'roles.manage_permissions', refusal: 'NON_DELEGATABLE' },
    ]);
  });

  it('refuses a key that is not in the catalogue', () => {
    expect(refuseApiKeyPermissions(['orders.delete_everything'], ['orders.delete_everything'])).toEqual([
      { key: 'orders.delete_everything', refusal: 'UNKNOWN' },
    ]);
  });

  it('reports each refused key once', () => {
    expect(refuseApiKeyPermissions(['users.manage', 'users.manage'], [])).toHaveLength(1);
  });
});

describe('delegatablePermissionsOf — the admin picker’s options', () => {
  it('offers what the person holds, minus what may never be delegated, in catalogue order', () => {
    const offered = delegatablePermissionsOf(['users.manage', 'orders.manage', 'analytics.view', 'settings.manage']);
    expect(offered).toEqual(['analytics.view', 'orders.manage']);
  });

  it('offers nothing to someone holding only non-delegatable permissions — a customer', () => {
    expect(delegatablePermissionsOf(['account.change_own_password'])).toEqual([]);
  });
});

describe('CUSTOMER_SCOPE_CATALOG', () => {
  it('has unique keys, each "<resource>:<access>" matching its own fields', () => {
    expect(new Set(CUSTOMER_SCOPE_KEYS).size).toBe(CUSTOMER_SCOPE_KEYS.length);
    for (const scope of CUSTOMER_SCOPE_CATALOG) {
      expect(scope.key).toBe(`${scope.resource}:${scope.access}`);
    }
  });

  it('gives every write scope a read scope for the same resource, so write can imply read', () => {
    for (const scope of CUSTOMER_SCOPE_CATALOG.filter((candidate) => candidate.access === 'write')) {
      expect(CUSTOMER_SCOPE_KEYS).toContain(`${scope.resource}:read`);
    }
  });

  it('covers every declared resource with at least a read scope', () => {
    for (const resource of CUSTOMER_SCOPE_RESOURCES) {
      expect(CUSTOMER_SCOPE_KEYS).toContain(`${resource}:read`);
    }
  });

  it('never names an admin permission — the two catalogues cannot be confused', () => {
    for (const key of CUSTOMER_SCOPE_KEYS) {
      expect(PERMISSION_KEYS).not.toContain(key);
      expect(key).toContain(':');
    }
  });
});

describe('expandCustomerScopes', () => {
  it('gives a write scope its read scope', () => {
    expect(expandCustomerScopes(['addresses:write'])).toEqual(['addresses:read', 'addresses:write']);
  });

  it('does not turn a read scope into a write scope', () => {
    expect(expandCustomerScopes(['addresses:read'])).toEqual(['addresses:read']);
  });

  it('drops a scope the catalogue no longer knows, so a retired scope stops working with no migration', () => {
    expect(expandCustomerScopes(['orders:read', 'orders:cancel'])).toEqual(['orders:read']);
  });

  it('deduplicates and returns catalogue order', () => {
    expect(expandCustomerScopes(['wishlist:read', 'orders:read', 'wishlist:write', 'orders:read'])).toEqual([
      'orders:read',
      'wishlist:read',
      'wishlist:write',
    ]);
  });

  it('is empty for no scopes', () => {
    expect(expandCustomerScopes([])).toEqual([]);
  });
});

describe('unknownCustomerScopes', () => {
  it('names only the scopes the catalogue lacks, once each', () => {
    expect(unknownCustomerScopes(['orders:read', 'cart:write', 'cart:write'])).toEqual(['cart:write']);
  });
});

describe('prefixes and surfaces', () => {
  it('recognises each surface by its prefix', () => {
    expect(apiKeySurfaceOf(`${API_KEY_PREFIXES.ADMIN}_abc`)).toBe('ADMIN');
    expect(apiKeySurfaceOf(`${API_KEY_PREFIXES.STOREFRONT}_abc`)).toBe('STOREFRONT');
  });

  it('never mistakes a session JWT, another credential, or a bare prefix for a key', () => {
    expect(apiKeySurfaceOf('eyJhbGciOiJIUzI1NiJ9.e30.x')).toBeNull();
    expect(apiKeySurfaceOf('tp_abc')).toBeNull();
    expect(apiKeySurfaceOf('pos_abc')).toBeNull();
    expect(apiKeySurfaceOf(API_KEY_PREFIXES.ADMIN)).toBeNull();
    expect(apiKeySurfaceOf('')).toBeNull();
  });

  it('gives every surface a distinct prefix that is not another’s prefix', () => {
    const prefixes = API_KEY_SURFACES.map((surface) => `${API_KEY_PREFIXES[surface]}_`);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const a of prefixes) {
      for (const b of prefixes) {
        if (a !== b) expect(b.startsWith(a)).toBe(false);
      }
    }
  });
});

describe('lifetimes', () => {
  it('offers only lifetimes within the ceiling, and defaults to one of them', () => {
    for (const days of API_KEY_LIFETIME_OPTIONS_DAYS) {
      expect(days).toBeGreaterThan(0);
      expect(days).toBeLessThanOrEqual(API_KEY_MAX_LIFETIME_DAYS);
    }
    expect(API_KEY_LIFETIME_OPTIONS_DAYS).toContain(API_KEY_DEFAULT_LIFETIME_DAYS);
  });
});

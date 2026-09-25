import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiKeyPrincipal } from '../auth.constants';
import { AuthenticatedOnly, CustomerScope, Public, RequirePermission, SessionOnly } from '../decorators';
import { decideApiKeyAccess, readRouteRequirements, type RouteRequirements } from './api-key-access';

const adminKey: ApiKeyPrincipal = { id: 'k-admin', surface: 'ADMIN', customerScopes: [] };
const storeKey = (customerScopes: string[]): ApiKeyPrincipal => ({ id: 'k-store', surface: 'STOREFRONT', customerScopes });

const route = (overrides: Partial<RouteRequirements> = {}): RouteRequirements => ({
  isPublic: false,
  sessionOnly: false,
  requiredPermissions: [],
  requiredCustomerScopes: [],
  ...overrides,
});

describe('decideApiKeyAccess — an ADMIN key', () => {
  it('reaches a route whose permission it effectively holds', () => {
    expect(decideApiKeyAccess(adminKey, ['orders.manage'], route({ requiredPermissions: ['orders.manage'] }))).toEqual({
      allowed: true,
    });
  });

  it('reaches a route requiring any one of several permissions when it holds one', () => {
    const decision = decideApiKeyAccess(
      adminKey,
      ['fulfilment.view'],
      route({ requiredPermissions: ['fulfilment.view', 'fulfilment.manage'] }),
    );
    expect(decision.allowed).toBe(true);
  });

  it('is refused a route whose permission it does not hold — including one its owner lost since', () => {
    const decision = decideApiKeyAccess(adminKey, ['orders.manage'], route({ requiredPermissions: ['catalog.manage'] }));
    expect(decision).toEqual({ allowed: false, reason: expect.stringContaining('catalog.manage') });
  });

  it('fails closed on a signed-in-only route that names no permission', () => {
    // GET /auth/me, the key-management routes, PATCH /auth/me: none name a
    // permission, so no admin key reaches them however much it carries.
    const decision = decideApiKeyAccess(adminKey, ['orders.manage', 'catalog.manage'], route());
    expect(decision.allowed).toBe(false);
  });

  it('is refused a customer route, even one naming a scope', () => {
    const decision = decideApiKeyAccess(adminKey, ['orders.manage'], route({ requiredCustomerScopes: ['orders:read'] }));
    expect(decision.allowed).toBe(false);
  });

  it('is refused a session-only route even when it holds the route’s permission', () => {
    const decision = decideApiKeyAccess(
      adminKey,
      ['purchasing.manage'],
      route({ sessionOnly: true, requiredPermissions: ['purchasing.manage'] }),
    );
    expect(decision).toEqual({ allowed: false, reason: expect.stringContaining('signed-in session') });
  });

  it('with an empty effective set — a fully demoted owner — reaches nothing', () => {
    expect(decideApiKeyAccess(adminKey, [], route({ requiredPermissions: ['orders.manage'] })).allowed).toBe(false);
  });
});

describe('decideApiKeyAccess — a STOREFRONT key', () => {
  it('reaches a customer route whose scope it carries', () => {
    expect(decideApiKeyAccess(storeKey(['orders:read']), [], route({ requiredCustomerScopes: ['orders:read'] }))).toEqual({
      allowed: true,
    });
  });

  it('is refused a customer route whose scope it lacks', () => {
    const decision = decideApiKeyAccess(storeKey(['orders:read']), [], route({ requiredCustomerScopes: ['addresses:read'] }));
    expect(decision).toEqual({ allowed: false, reason: expect.stringContaining('addresses:read') });
  });

  it('fails closed on a signed-in-only route that names no scope', () => {
    // PATCH /auth/me, /me/devices, /notification-preferences, /wishlist/migrate.
    expect(decideApiKeyAccess(storeKey(['orders:read', 'profile:read']), [], route()).allowed).toBe(false);
  });

  it('is refused every admin route, whatever it carries', () => {
    const decision = decideApiKeyAccess(
      storeKey(['orders:read']),
      [],
      route({ requiredPermissions: ['account.change_own_password'] }),
    );
    expect(decision).toEqual({ allowed: false, reason: 'Storefront API keys cannot call admin routes.' });
  });

  it('is refused a session-only route even when it carries a scope the route also names', () => {
    const decision = decideApiKeyAccess(
      storeKey(['profile:read']),
      [],
      route({ sessionOnly: true, requiredCustomerScopes: ['profile:read'] }),
    );
    expect(decision.allowed).toBe(false);
  });
});

describe('readRouteRequirements — the handler overrides its controller, as for sessions', () => {
  @AuthenticatedOnly()
  @CustomerScope('store-credit:read')
  class ScopedController {
    balance(): void {}

    @CustomerScope('wishlist:write')
    add(): void {}
  }

  @RequirePermission('purchasing.manage')
  class PartnersController {
    list(): void {}

    @SessionOnly()
    rotate(): void {}
  }

  class PublicController {
    @Public()
    browse(): void {}
  }

  const contextFor = (klass: new () => object, handler: string): ExecutionContext =>
    ({
      getHandler: () => (klass.prototype as Record<string, unknown>)[handler],
      getClass: () => klass,
    }) as unknown as ExecutionContext;

  const reflector = new Reflector();

  it('reads a class-level customer scope', () => {
    expect(readRouteRequirements(reflector, contextFor(ScopedController, 'balance'))).toEqual({
      isPublic: false,
      sessionOnly: false,
      requiredPermissions: [],
      requiredCustomerScopes: ['store-credit:read'],
    });
  });

  it('lets a method-level scope override the class-level one', () => {
    expect(readRouteRequirements(reflector, contextFor(ScopedController, 'add')).requiredCustomerScopes).toEqual([
      'wishlist:write',
    ]);
  });

  it('reads a class-level permission and a method-level session-only marker together', () => {
    expect(readRouteRequirements(reflector, contextFor(PartnersController, 'rotate'))).toMatchObject({
      sessionOnly: true,
      requiredPermissions: ['purchasing.manage'],
    });
    expect(readRouteRequirements(reflector, contextFor(PartnersController, 'list')).sessionOnly).toBe(false);
  });

  it('reads @Public()', () => {
    expect(readRouteRequirements(reflector, contextFor(PublicController, 'browse')).isPublic).toBe(true);
  });
});

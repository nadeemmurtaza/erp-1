import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from './auth.constants';
import { ApiKeyAuthService } from './api-keys/api-key-auth.service';
import { AuthenticatedOnly, CustomerScope, Public, RequirePermission, SessionOnly } from './decorators';
import { JwtAuthGuard, PermissionsGuard } from './guards';

/* Controllers standing in for real routes — the guards read only metadata. */

class Routes {
  @RequirePermission('orders.manage')
  adminOrders(): void {}

  @AuthenticatedOnly()
  me(): void {}

  @AuthenticatedOnly()
  @CustomerScope('orders:read')
  myOrders(): void {}

  @RequirePermission('purchasing.manage')
  @SessionOnly()
  rotatePartnerKey(): void {}

  @Public()
  browse(): void {}

  @Public()
  @CustomerScope('profile:read')
  personalisedBrowse(): void {}
}

const contextFor = (handler: keyof Routes, request: Record<string, unknown>): ExecutionContext =>
  ({
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const sessionUser: AuthenticatedUser = {
  id: 'u1',
  roles: ['Staff'],
  permissions: ['orders.manage'],
  email: 'staff@example.com',
  phone: null,
};

const adminKeyUser = (permissions: string[]): AuthenticatedUser => ({
  ...sessionUser,
  roles: [],
  permissions,
  apiKey: { id: 'k1', surface: 'ADMIN', customerScopes: [] },
});

const storeKeyUser = (customerScopes: string[]): AuthenticatedUser => ({
  ...sessionUser,
  roles: [],
  permissions: [],
  apiKey: { id: 'k2', surface: 'STOREFRONT', customerScopes },
});

describe('JwtAuthGuard', () => {
  let apiKeys: { authenticate: jest.Mock };
  let guard: JwtAuthGuard;
  let passport: jest.SpyInstance;

  beforeEach(() => {
    apiKeys = { authenticate: jest.fn() };
    guard = new JwtAuthGuard(new Reflector(), apiKeys as unknown as ApiKeyAuthService);
    passport = jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate').mockResolvedValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('a session JWT — the path is unchanged', () => {
    it('is authenticated by passport-jwt, never by the API-key service', async () => {
      const request = { headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.sig' } };

      await expect(guard.canActivate(contextFor('adminOrders', request))).resolves.toBe(true);

      expect(passport).toHaveBeenCalledTimes(1);
      expect(apiKeys.authenticate).not.toHaveBeenCalled();
    });

    it('is still ignored when bad on a public route', async () => {
      passport.mockRejectedValue(new UnauthorizedException());
      const request = { headers: { authorization: 'Bearer expired.jwt.token' } };

      await expect(guard.canActivate(contextFor('browse', request))).resolves.toBe(true);
    });

    it('leaves a request with no credential, or another scheme, to passport', async () => {
      await guard.canActivate(contextFor('adminOrders', { headers: {} }));
      await guard.canActivate(contextFor('adminOrders', { headers: { authorization: 'Basic nxa_looks-like-a-key' } }));

      expect(passport).toHaveBeenCalledTimes(2);
      expect(apiKeys.authenticate).not.toHaveBeenCalled();
    });
  });

  describe('a personal API key', () => {
    it('is recognised by its prefix, authenticated by the key service, and attached as the principal', async () => {
      const principal = adminKeyUser(['orders.manage']);
      apiKeys.authenticate.mockResolvedValue(principal);
      const request: Record<string, unknown> = { headers: { authorization: 'Bearer nxa_secret' }, ip: '203.0.113.9' };

      await expect(guard.canActivate(contextFor('adminOrders', request))).resolves.toBe(true);

      // The client address goes along, so failures can be counted per address.
      expect(apiKeys.authenticate).toHaveBeenCalledWith('nxa_secret', { clientIp: '203.0.113.9' });
      expect(passport).not.toHaveBeenCalled();
      expect(request.user).toBe(principal);
    });

    it('is recognised whatever the case of the scheme, as passport-jwt parses it', async () => {
      apiKeys.authenticate.mockResolvedValue(storeKeyUser(['orders:read']));
      await guard.canActivate(contextFor('myOrders', { headers: { authorization: 'bearer   nxs_secret' } }));
      expect(apiKeys.authenticate).toHaveBeenCalledWith('nxs_secret', { clientIp: undefined });
    });

    it('is refused with a 401 when it is dead — on a public route too, never quietly downgraded', async () => {
      apiKeys.authenticate.mockRejectedValue(new UnauthorizedException('This API key has been revoked.'));

      await expect(
        guard.canActivate(contextFor('browse', { headers: { authorization: 'Bearer nxs_revoked' } })),
      ).rejects.toThrow('This API key has been revoked.');
    });

    it('does not personalise a public route that names no capability — the request is a guest’s', async () => {
      apiKeys.authenticate.mockResolvedValue(storeKeyUser(['orders:read', 'profile:read']));
      const request: Record<string, unknown> = { headers: { authorization: 'Bearer nxs_secret' } };

      await expect(guard.canActivate(contextFor('browse', request))).resolves.toBe(true);

      expect(request.user).toBeUndefined();
    });

    it('personalises a public route that names a capability the key holds', async () => {
      const principal = storeKeyUser(['profile:read']);
      apiKeys.authenticate.mockResolvedValue(principal);
      const request: Record<string, unknown> = { headers: { authorization: 'Bearer nxs_secret' } };

      await guard.canActivate(contextFor('personalisedBrowse', request));

      expect(request.user).toBe(principal);
    });

    it('stays a guest on that route when the key lacks the capability', async () => {
      apiKeys.authenticate.mockResolvedValue(storeKeyUser(['orders:read']));
      const request: Record<string, unknown> = { headers: { authorization: 'Bearer nxs_secret' } };

      await guard.canActivate(contextFor('personalisedBrowse', request));

      expect(request.user).toBeUndefined();
    });
  });
});

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());
  const run = (handler: keyof Routes, user?: AuthenticatedUser) => () => guard.canActivate(contextFor(handler, { user }));

  describe('a session — unchanged', () => {
    it('passes a route whose permission it holds, and a signed-in-only route', () => {
      expect(run('adminOrders', sessionUser)()).toBe(true);
      expect(run('me', sessionUser)()).toBe(true);
    });

    it('refuses a permission it lacks', () => {
      expect(run('adminOrders', { ...sessionUser, permissions: [] })).toThrow(ForbiddenException);
    });

    it('is not refused a session-only route', () => {
      expect(run('rotatePartnerKey', { ...sessionUser, permissions: ['purchasing.manage'] })()).toBe(true);
    });
  });

  describe('an ADMIN key', () => {
    it('passes a route whose permission is in its effective set', () => {
      expect(run('adminOrders', adminKeyUser(['orders.manage']))()).toBe(true);
    });

    it('is refused a route outside its effective set', () => {
      expect(run('adminOrders', adminKeyUser(['catalog.manage']))).toThrow(ForbiddenException);
    });

    it('is refused a signed-in-only route — fail-closed', () => {
      expect(run('me', adminKeyUser(['orders.manage']))).toThrow('This route does not accept admin API keys.');
    });

    it('is refused a session-only route even holding its permission', () => {
      expect(run('rotatePartnerKey', adminKeyUser(['purchasing.manage']))).toThrow(/signed-in session/);
    });

    it('is refused a customer route', () => {
      expect(run('myOrders', adminKeyUser(['orders.manage']))).toThrow(ForbiddenException);
    });
  });

  describe('a STOREFRONT key', () => {
    it('passes a customer route whose scope it carries', () => {
      expect(run('myOrders', storeKeyUser(['orders:read']))()).toBe(true);
    });

    it('is refused one whose scope it lacks, a signed-in-only route, and every admin route', () => {
      expect(run('myOrders', storeKeyUser(['addresses:read']))).toThrow(ForbiddenException);
      expect(run('me', storeKeyUser(['orders:read']))).toThrow('This route does not accept storefront API keys.');
      expect(run('adminOrders', storeKeyUser(['orders:read']))).toThrow('Storefront API keys cannot call admin routes.');
    });
  });
});

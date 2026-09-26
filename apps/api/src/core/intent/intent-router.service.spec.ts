import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.constants';
import { IntentRouterService } from './intent-router.service';

function actor(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { id: 'u1', roles: ['STAFF'], permissions: [], email: null, phone: null, ...overrides };
}

describe('IntentRouterService', () => {
  let router: IntentRouterService;

  beforeEach(() => {
    router = new IntentRouterService();
  });

  describe('routing', () => {
    it('calls the registered handler with the intent parameters and actor, and returns its result', async () => {
      const handler = jest.fn().mockResolvedValue({ ok: true });
      router.register({ name: 'do_thing', description: 'test', requiredPermissions: [], handler });
      const who = actor();

      const result = await router.route({ name: 'do_thing', parameters: { a: 1 }, actor: who, sourceModality: 'dashboard' });

      expect(result).toEqual({ ok: true });
      expect(handler).toHaveBeenCalledWith({ a: 1 }, who);
    });

    it("returns a structured error for an unregistered intent, never a silent no-op (the doc's own failure path)", async () => {
      await expect(
        router.route({ name: 'no_such_intent', parameters: {}, actor: actor(), sourceModality: 'voice' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to register the same intent name twice', () => {
      router.register({ name: 'dup', description: '', requiredPermissions: [], handler: jest.fn() });
      expect(() => router.register({ name: 'dup', description: '', requiredPermissions: [], handler: jest.fn() })).toThrow(
        /already registered/,
      );
    });

    it('lists every registered intent by name, description, permissions and session-only flag', () => {
      router.register({ name: 'a', description: 'does a', requiredPermissions: ['x.manage'], handler: jest.fn() });
      router.register({ name: 'b', description: 'does b', requiredPermissions: [], sessionOnly: true, handler: jest.fn() });

      expect(router.list()).toEqual([
        { name: 'a', description: 'does a', requiredPermissions: ['x.manage'], sessionOnly: false },
        { name: 'b', description: 'does b', requiredPermissions: [], sessionOnly: true },
      ]);
    });
  });

  describe('permission enforcement — mirrors PermissionsGuard exactly, for a session actor', () => {
    it('allows a session actor who holds any one of the required permissions (OR semantics, same as @RequirePermission)', async () => {
      const handler = jest.fn().mockResolvedValue('done');
      router.register({ name: 'either', description: '', requiredPermissions: ['a.manage', 'b.manage'], handler });

      await expect(
        router.route({ name: 'either', parameters: {}, actor: actor({ permissions: ['b.manage'] }), sourceModality: 'dashboard' }),
      ).resolves.toBe('done');
    });

    it('refuses a session actor who holds none of the required permissions', async () => {
      router.register({ name: 'gated', description: '', requiredPermissions: ['orders.manage'], handler: jest.fn() });

      await expect(
        router.route({ name: 'gated', parameters: {}, actor: actor({ permissions: ['catalog.manage'] }), sourceModality: 'dashboard' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows any authenticated actor when the intent names no required permission, same as an undecorated route', async () => {
      router.register({ name: 'open', description: '', requiredPermissions: [], handler: jest.fn().mockResolvedValue('ok') });

      await expect(
        router.route({ name: 'open', parameters: {}, actor: actor({ permissions: [] }), sourceModality: 'dashboard' }),
      ).resolves.toBe('ok');
    });
  });

  describe('permission enforcement — an API-key actor, reusing decideApiKeyAccess so it can never drift from the HTTP path', () => {
    it('allows an ADMIN-surface key whose effective permissions include one required permission', async () => {
      router.register({ name: 'gated', description: '', requiredPermissions: ['orders.manage'], handler: jest.fn().mockResolvedValue('ok') });
      const keyActor = actor({ permissions: ['orders.manage'], apiKey: { id: 'k1', surface: 'ADMIN', customerScopes: [] } });

      await expect(
        router.route({ name: 'gated', parameters: {}, actor: keyActor, sourceModality: 'mcp_agent' }),
      ).resolves.toBe('ok');
    });

    it('refuses an ADMIN-surface key that does not carry the required permission', async () => {
      router.register({ name: 'gated', description: '', requiredPermissions: ['orders.manage'], handler: jest.fn() });
      const keyActor = actor({ permissions: [], apiKey: { id: 'k1', surface: 'ADMIN', customerScopes: [] } });

      await expect(
        router.route({ name: 'gated', parameters: {}, actor: keyActor, sourceModality: 'mcp_agent' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a STOREFRONT-surface key on an intent that names an admin permission — a key never gets a shortcut around a permission it could never hold', async () => {
      router.register({ name: 'gated', description: '', requiredPermissions: ['orders.manage'], handler: jest.fn() });
      const keyActor = actor({ permissions: [], apiKey: { id: 'k1', surface: 'STOREFRONT', customerScopes: [] } });

      await expect(
        router.route({ name: 'gated', parameters: {}, actor: keyActor, sourceModality: 'mcp_agent' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses ANY API-key actor on a sessionOnly intent, whatever permission it carries — a key must never mint something that outlives it', async () => {
      router.register({
        name: 'issue_credential',
        description: '',
        requiredPermissions: ['purchasing.manage'],
        sessionOnly: true,
        handler: jest.fn(),
      });
      const keyActor = actor({ permissions: ['purchasing.manage'], apiKey: { id: 'k1', surface: 'ADMIN', customerScopes: [] } });

      await expect(
        router.route({ name: 'issue_credential', parameters: {}, actor: keyActor, sourceModality: 'mcp_agent' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('never refuses a session actor (no apiKey) on a sessionOnly intent — @SessionOnly() only ever refuses keys', async () => {
      router.register({
        name: 'issue_credential',
        description: '',
        requiredPermissions: ['purchasing.manage'],
        sessionOnly: true,
        handler: jest.fn().mockResolvedValue('ok'),
      });

      await expect(
        router.route({
          name: 'issue_credential',
          parameters: {},
          actor: actor({ permissions: ['purchasing.manage'] }),
          sourceModality: 'dashboard',
        }),
      ).resolves.toBe('ok');
    });
  });
});

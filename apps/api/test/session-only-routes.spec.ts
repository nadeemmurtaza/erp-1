import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { readRouteRequirements } from '../src/core/auth/api-keys/api-key-access';
import { ApiKeysAdminController } from '../src/core/auth/api-keys/api-keys-admin.controller';
import { ApiKeysController } from '../src/core/auth/api-keys/api-keys.controller';
import { AuthController } from '../src/core/auth/auth.controller';
import { SsoAdminController } from '../src/core/auth/sso-admin.controller';
import { OrganizationController } from '../src/modules/people/organization/organization.controller';
import { PosTerminalsController } from '../src/modules/sales/pos/pos-terminals.controller';
import { TradingPartnersController } from '../src/modules/supply-chain/tradingpartners/trading-partners.controller';
import { UsersAdminController } from '../src/modules/system/users/users-admin.controller';

/**
 * Pins `@SessionOnly()` on every route that issues, rotates or installs a
 * credential, or changes an account's sign-in identity
 * (163-personal-api-keys.md §2, `.claude/rules/security.md`).
 *
 * The permission-level non-delegatable list cannot catch these on its own:
 * `purchasing.manage` is a legitimate integration permission AND gates
 * minting a trading-partner key. A personal API key must never mint a
 * credential that outlives it, so these are refused to every key by route —
 * and this spec fails the moment the marker is dropped from one of them.
 *
 * A new credential route belongs in this list.
 */
type Controller = new (...args: never[]) => object;

const SESSION_ONLY_ROUTES: Array<[Controller, string, string]> = [
  [TradingPartnersController, 'rotateInboundKey', 'mints a tp_ credential'],
  [TradingPartnersController, 'invite', 'mints a tpi_ invite credential'],
  [TradingPartnersController, 'setOutboundApiKey', 'installs a credential'],
  [TradingPartnersController, 'update', 'can redirect a stored credential via outboundBaseUrl'],
  [OrganizationController, 'rotateNodeInboundKey', 'mints a replication credential'],
  [PosTerminalsController, 'rotateDeviceKey', 'mints a till device credential'],
  [UsersAdminController, 'create', 'issues a password'],
  [UsersAdminController, 'resetPassword', 'issues a password'],
  [AuthController, 'changePassword', "the account's own credential"],
  [AuthController, 'updateProfile', 'the sign-in and password-reset identity'],
  [ApiKeysController, 'list', 'a key never manages keys'],
  [ApiKeysController, 'create', 'a key never manages keys'],
  [ApiKeysController, 'update', 'a key never manages keys'],
  [ApiKeysController, 'rotate', 'a key never manages keys'],
  [ApiKeysController, 'revoke', 'a key never manages keys'],
  [ApiKeysAdminController, 'list', 'a key never manages keys'],
  [ApiKeysAdminController, 'revoke', 'a key never manages keys'],
  [SsoAdminController, 'create', 'installs an identity provider client secret'],
  [SsoAdminController, 'update', 'can replace a client secret, or repoint which provider signs accounts in'],
  [SsoAdminController, 'suspend', "changes how accounts may sign in"],
  [SsoAdminController, 'unlink', "changes an account's sign-in identity"],
  [SsoAdminController, 'list', 'sign-in configuration is never reachable by a key'],
  [SsoAdminController, 'get', 'sign-in configuration is never reachable by a key'],
  [SsoAdminController, 'accounts', 'sign-in configuration is never reachable by a key'],
  [SsoAdminController, 'roles', 'sign-in configuration is never reachable by a key'],
];

const reflector = new Reflector();

function requirementsOf(controller: Controller, handler: string) {
  const method = (controller.prototype as Record<string, unknown>)[handler];
  if (typeof method !== 'function') throw new Error(`${controller.name}.${handler} does not exist`);
  const context = { getHandler: () => method, getClass: () => controller } as unknown as ExecutionContext;
  return readRouteRequirements(reflector, context);
}

describe('credential routes are refused to every API key', () => {
  it.each(SESSION_ONLY_ROUTES)('%p.%s is @SessionOnly() — %s', (controller, handler) => {
    expect(requirementsOf(controller, handler).sessionOnly).toBe(true);
  });

  it('leaves ordinary routes on the same controllers reachable by a key that holds their permission', () => {
    expect(requirementsOf(TradingPartnersController, 'findAll').sessionOnly).toBe(false);
    expect(requirementsOf(PosTerminalsController, 'findAll').sessionOnly).toBe(false);
  });
});

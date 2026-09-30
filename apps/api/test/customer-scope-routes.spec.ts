import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Get, Controller as NestController, Post, RequestMethod, type ExecutionContext } from '@nestjs/common';
import { CONTROLLER_WATERMARK, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { CUSTOMER_SCOPE_CATALOG, CUSTOMER_SCOPE_KEYS } from '@newax/shared';
import { readRouteRequirements } from '../src/core/auth/api-keys/api-key-access';
import { CustomerScope } from '../src/core/auth/decorators';
import { B2BAccountsController } from '../src/modules/sales/accounts/accounts.controller';
import { AuthController } from '../src/core/auth/auth.controller';
import { DevicesController } from '../src/core/notifications/devices.controller';
import { AddressesController } from '../src/modules/sales/addresses/addresses.controller';
import { ReturnsController } from '../src/modules/sales/fulfilment/returns.controller';
import { GiftCardsAccountController } from '../src/modules/sales/giftcards/giftcards-account.controller';
import { StoreCreditAccountController } from '../src/modules/sales/giftcards/store-credit-account.controller';
import { IdentityVerificationController } from '../src/modules/system/identity-verification/identity-verification.controller';
import { LoyaltyController } from '../src/modules/sales/loyalty/loyalty.controller';
import { MeasurementsController } from '../src/modules/sales/measurements/measurements.controller';
import { NotificationPreferencesController } from '../src/modules/customers/notification-preferences/notification-preferences.controller';
import { OrdersController } from '../src/modules/sales/orders/orders.controller';
import { ReviewsPublicController } from '../src/modules/sales/reviews/reviews-public.controller';
import { CustomerSupportController } from '../src/modules/customers/support/customer-support.controller';
import { WishlistController } from '../src/modules/sales/wishlist/wishlist.controller';

/**
 * The storefront scope catalogue, pinned to the routes that carry it
 * (163-personal-api-keys.md §4). Two directions: every route listed here
 * declares exactly this scope, and every scope in `CUSTOMER_SCOPE_CATALOG`
 * is declared by at least one route — a scope nothing declares would be one
 * a customer could grant that opens nothing.
 */
type Controller = new (...args: never[]) => object;

const SCOPED_ROUTES: Array<[Controller, string, string]> = [
  [AuthController, 'me', 'profile:read'],
  [OrdersController, 'mine', 'orders:read'],
  [OrdersController, 'get', 'orders:read'],
  [AddressesController, 'list', 'addresses:read'],
  [AddressesController, 'create', 'addresses:write'],
  [AddressesController, 'update', 'addresses:write'],
  [AddressesController, 'remove', 'addresses:write'],
  [MeasurementsController, 'listProfiles', 'measurements:read'],
  [MeasurementsController, 'getProfile', 'measurements:read'],
  [MeasurementsController, 'createProfile', 'measurements:write'],
  [MeasurementsController, 'updateProfile', 'measurements:write'],
  [MeasurementsController, 'deleteProfile', 'measurements:write'],
  [WishlistController, 'list', 'wishlist:read'],
  [WishlistController, 'myAlerts', 'wishlist:read'],
  [WishlistController, 'add', 'wishlist:write'],
  [WishlistController, 'remove', 'wishlist:write'],
  [WishlistController, 'requestAlert', 'wishlist:write'],
  [WishlistController, 'cancelAlert', 'wishlist:write'],
  [ReviewsPublicController, 'mine', 'reviews:read'],
  [ReviewsPublicController, 'create', 'reviews:write'],
  [ReturnsController, 'listReasons', 'returns:read'],
  [ReturnsController, 'mine', 'returns:read'],
  [ReturnsController, 'get', 'returns:read'],
  [ReturnsController, 'create', 'returns:write'],
  [ReturnsController, 'uploadPhoto', 'returns:write'],
  [LoyaltyController, 'balance', 'loyalty:read'],
  [LoyaltyController, 'ledger', 'loyalty:read'],
  [LoyaltyController, 'myReferralCode', 'loyalty:read'],
  [LoyaltyController, 'myReferrals', 'loyalty:read'],
  [StoreCreditAccountController, 'balance', 'store-credit:read'],
  [StoreCreditAccountController, 'ledger', 'store-credit:read'],
  [B2BAccountsController, 'myAccount', 'b2b-account:read'],
  [B2BAccountsController, 'myRequests', 'b2b-account:read'],
  [B2BAccountsController, 'pendingApprovals', 'b2b-account:read'],
  [CustomerSupportController, 'raise', 'support:write'],
  [CustomerSupportController, 'mine', 'support:read'],
  [CustomerSupportController, 'get', 'support:read'],
  [CustomerSupportController, 'reply', 'support:write'],
  [CustomerSupportController, 'transition', 'support:write'],
];

/** Customer routes deliberately left to a signed-in session — each with its reason in doc 163 §4. */
const SESSION_ONLY_BY_OMISSION: Array<[Controller, string]> = [
  [AuthController, 'updateProfile'],
  [AuthController, 'resendVerification'],
  [WishlistController, 'migrate'],
  [LoyaltyController, 'redeem'],
  [LoyaltyController, 'applyReferralCode'],
  [GiftCardsAccountController, 'balance'],
  [GiftCardsAccountController, 'redeemIntoAccount'],
  [NotificationPreferencesController, 'list'],
  [NotificationPreferencesController, 'update'],
  [DevicesController, 'register'],
  [DevicesController, 'unregister'],
  [IdentityVerificationController, 'start'],
  [IdentityVerificationController, 'submitOtp'],
  [IdentityVerificationController, 'me'],
  [OrdersController, 'place'],
  [B2BAccountsController, 'submit'],
  [B2BAccountsController, 'decide'],
  [B2BAccountsController, 'setMyPolicy'],
];

const reflector = new Reflector();

function requirementsOf(controller: Controller, handler: string) {
  const method = (controller.prototype as Record<string, unknown>)[handler];
  if (typeof method !== 'function') throw new Error(`${controller.name}.${handler} does not exist`);
  const context = { getHandler: () => method, getClass: () => controller } as unknown as ExecutionContext;
  return readRouteRequirements(reflector, context);
}

describe('storefront API key scopes, route by route', () => {
  it.each(SCOPED_ROUTES)('%p.%s declares %s', (controller, handler, scope) => {
    expect(requirementsOf(controller, handler).requiredCustomerScopes).toEqual([scope]);
  });

  it.each(SESSION_ONLY_BY_OMISSION)('%p.%s declares no scope, so no storefront key reaches it', (controller, handler) => {
    expect(requirementsOf(controller, handler).requiredCustomerScopes).toEqual([]);
  });

  it('declares every catalogue scope on at least one route — no scope opens nothing', () => {
    const declared = new Set(SCOPED_ROUTES.map(([, , scope]) => scope));
    expect([...CUSTOMER_SCOPE_KEYS].filter((scope) => !declared.has(scope))).toEqual([]);
  });
});

/**
 * The lists above only check the routes someone remembered to list. This
 * sweeps every controller in the API for the two mistakes that would widen a
 * key silently, with no test failing:
 *
 * - a scope nobody reviewed — a new handler on a controller whose class
 *   carries `@CustomerScope` (`StoreCreditAccountController`) inherits it;
 * - a read scope opening a write — `write` implies `read`
 *   (`expandCustomerScopes()`), so a `read` scope on a `POST` would let every
 *   read-only key change state.
 */
describe('storefront API key scopes, swept across every controller', () => {
  const WRITE_SCOPES: ReadonlySet<string> = new Set(
    CUSTOMER_SCOPE_CATALOG.filter((scope) => scope.access === 'write').map((scope) => scope.key),
  );
  const READ_ONLY_METHODS: ReadonlySet<RequestMethod> = new Set([RequestMethod.GET, RequestMethod.HEAD]);

  interface ScopedHandler {
    route: string;
    method: RequestMethod;
    scopes: readonly string[];
  }

  let scoped: ScopedHandler[] = [];

  /** Every controller class under src/, found by walking the tree — so a controller added tomorrow is swept too. */
  async function allControllers(): Promise<Controller[]> {
    const root = join(__dirname, '../src');
    const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.controller.ts'));
    const found = new Set<Controller>();
    for (const file of files) {
      const exported = (await import(join(root, file))) as Record<string, unknown>;
      for (const value of Object.values(exported)) {
        if (typeof value === 'function' && reflector.get<boolean | undefined>(CONTROLLER_WATERMARK, value) === true) {
          found.add(value as Controller);
        }
      }
    }
    return [...found];
  }

  /** Route handlers, inherited ones included — Nest routes those too. `RequestMethod.GET` is 0, hence `!== undefined`. */
  function routeHandlers(controller: Controller): string[] {
    const names = new Set<string>();
    for (let proto: object | null = controller.prototype; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        const member: unknown = Object.getOwnPropertyDescriptor(proto, name)?.value;
        if (name !== 'constructor' && typeof member === 'function' && reflector.get(METHOD_METADATA, member) !== undefined) {
          names.add(name);
        }
      }
    }
    return [...names];
  }

  /** A controller's handlers that declare a storefront scope, class-level ones applied, with each one's HTTP method. */
  function scopedHandlersOf(controller: Controller): ScopedHandler[] {
    return routeHandlers(controller).flatMap((handler) => {
      const scopes = requirementsOf(controller, handler).requiredCustomerScopes;
      if (scopes.length === 0) return [];
      const member = (controller.prototype as Record<string, (...args: unknown[]) => unknown>)[handler];
      return [{ route: `${controller.name}.${handler}`, method: reflector.get<RequestMethod>(METHOD_METADATA, member), scopes }];
    });
  }

  /** Handlers that change state yet accept a scope that is not a write scope — what must never exist. */
  function readScopesOnWrites(handlers: readonly ScopedHandler[]): ScopedHandler[] {
    return handlers.filter(
      ({ method, scopes }) => !READ_ONLY_METHODS.has(method) && scopes.some((scope) => !WRITE_SCOPES.has(scope)),
    );
  }

  beforeAll(async () => {
    for (const controller of await allControllers()) scoped.push(...scopedHandlersOf(controller));
  });

  afterAll(() => {
    scoped = [];
  });

  it('finds the scoped routes it is meant to sweep — a broken walk must not pass as a clean one', () => {
    expect(scoped.map(({ route }) => route)).toEqual(expect.arrayContaining(['AuthController.me', 'AddressesController.create']));
  });

  it('finds no scoped route missing from the reviewed list above — an inherited or new scope fails here until reviewed', () => {
    const reviewed = SCOPED_ROUTES.map(([controller, handler]) => `${controller.name}.${handler}`).sort();
    expect(scoped.map(({ route }) => route).sort()).toEqual(reviewed);
  });

  it('never lets a read scope open a route that changes state — anything but GET takes write scopes only', () => {
    expect(readScopesOnWrites(scoped)).toEqual([]);
  });

  it('catches a write handler that inherits a class-level read scope — the check has teeth', () => {
    @NestController('fixture')
    @CustomerScope('store-credit:read')
    class InheritsReadScope {
      @Get()
      read(): string {
        return 'read';
      }

      @Post()
      write(): string {
        return 'write';
      }

      @Post('explicit')
      @CustomerScope('addresses:write')
      explicitWrite(): string {
        return 'write';
      }
    }

    const handlers = scopedHandlersOf(InheritsReadScope);
    expect(handlers.map(({ route }) => route).sort()).toEqual(
      ['InheritsReadScope.explicitWrite', 'InheritsReadScope.read', 'InheritsReadScope.write'].sort(),
    );
    expect(readScopesOnWrites(handlers).map(({ route }) => route)).toEqual(['InheritsReadScope.write']);
  });
});

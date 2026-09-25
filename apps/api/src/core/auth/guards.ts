import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { apiKeySurfaceOf } from '@newax/shared';
import {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  type AuthenticatedUser,
} from './auth.constants';
import { decideApiKeyAccess, readRouteRequirements } from './api-keys/api-key-access';
import { ApiKeyAuthService } from './api-keys/api-key-auth.service';
import { bearerCredential } from './bearer-token';

interface GuardedRequest {
  headers: { authorization?: string };
  /** Express's client address — the same one ThrottlerGuard tracks. */
  ip?: string;
  user?: AuthenticatedUser;
}

/**
 * Registered globally in AppModule: every route requires a valid access token
 * unless it is marked @Public. Protection is the default, so a new endpoint is
 * never accidentally left open.
 *
 * On a @Public route the token is still parsed when present, so a storefront
 * endpoint can behave differently for a signed-in customer (their saved
 * measurement profiles, for instance) without a second guard.
 *
 * A personal API key (`nxa_…`/`nxs_…`, 163-personal-api-keys.md) is
 * recognised by its prefix and authenticated by ApiKeyAuthService instead of
 * passport-jwt; every other credential takes the JWT path exactly as before.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeys: ApiKeyAuthService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<GuardedRequest>();
    const credential = bearerCredential(request.headers?.authorization);
    if (credential && apiKeySurfaceOf(credential)) {
      await this.authenticateApiKey(context, request, credential);
      return true;
    }

    if (isPublic) {
      // Populate request.user when a token is present, but never reject.
      //
      // This must be awaited: passport attaches the user asynchronously, so
      // firing it off unawaited leaves request.user unset by the time the
      // handler runs — which silently turns a signed-in customer into a guest
      // on every public route (their saved measurements, their cart).
      // A malformed or expired token is simply ignored here.
      try {
        await super.canActivate(context);
      } catch {
        // Not signed in, or the token is no good. Both are fine on a public route.
      }
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }

  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser | false,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return (user || undefined) as TUser;
    }

    return super.handleRequest(err, user, _info, context);
  }

  /**
   * A key is authenticated on every route it is sent to — `@Public()` ones
   * included — so a revoked or expired key is always told so (401), never
   * quietly downgraded. PermissionsGuard then decides whether it may call a
   * protected route.
   *
   * On a `@Public()` route a key personalises the request only when the
   * route names a capability the key holds. Otherwise the request proceeds
   * exactly as a guest's would: `POST /orders` and the cart are public with
   * an optional signed-in user, and a key without a scope for them must
   * never turn into "act as the owner" there.
   */
  private async authenticateApiKey(
    context: ExecutionContext,
    request: GuardedRequest,
    credential: string,
  ): Promise<void> {
    const principal = await this.apiKeys.authenticate(credential, { clientIp: request.ip });
    const route = readRouteRequirements(this.reflector, context);

    if (route.isPublic && principal.apiKey) {
      if (decideApiKeyAccess(principal.apiKey, principal.permissions, route).allowed) {
        request.user = principal;
      }
      return;
    }

    request.user = principal;
  }
}

/**
 * Enforces @RequirePermission(...). Runs after JwtAuthGuard, so request.user
 * is set. A route passes if the caller holds ANY of the required permission
 * keys, mirroring the old RolesGuard's "role is in this allow-list" check.
 *
 * A request authenticated by a personal API key is decided by
 * `decideApiKeyAccess()` instead, which fails closed: the route must name a
 * capability of the key's own surface, and must not be `@SessionOnly()`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (user?.apiKey) {
      const decision = decideApiKeyAccess(user.apiKey, user.permissions, readRouteRequirements(this.reflector, context));
      if (!decision.allowed) throw new ForbiddenException(decision.reason);
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    if (!user || !required.some((key) => user.permissions.includes(key))) {
      throw new ForbiddenException('You do not have access to this resource.');
    }

    return true;
  }
}

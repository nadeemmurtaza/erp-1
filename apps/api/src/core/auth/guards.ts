import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  type AuthenticatedUser,
} from './auth.constants';

/**
 * Registered globally in AppModule: every route requires a valid access token
 * unless it is marked @Public. Protection is the default, so a new endpoint is
 * never accidentally left open.
 *
 * On a @Public route the token is still parsed when present, so a storefront
 * endpoint can behave differently for a signed-in customer (their saved
 * measurement profiles, for instance) without a second guard.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

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
}

/**
 * Enforces @RequirePermission(...). Runs after JwtAuthGuard, so request.user
 * is set. A route passes if the caller holds ANY of the required permission
 * keys, mirroring the old RolesGuard's "role is in this allow-list" check.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (!user || !required.some((key) => user.permissions.includes(key))) {
      throw new ForbiddenException('You do not have access to this resource.');
    }

    return true;
  }
}

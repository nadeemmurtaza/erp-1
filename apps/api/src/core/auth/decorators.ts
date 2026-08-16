import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserRole } from '../prisma/client';
import { IS_PUBLIC_KEY, ROLES_KEY, type AuthenticatedUser } from './auth.constants';

/**
 * Marks a route as reachable without a token.
 *
 * JwtAuthGuard is registered globally, so authentication is the default and
 * forgetting a guard leaves a route protected rather than open.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to the given roles. Implies authentication. */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated user, or undefined on a @Public route. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);

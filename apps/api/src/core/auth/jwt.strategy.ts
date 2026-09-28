import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsResolverService } from './permissions.service';
import type { AuthenticatedUser, JwtPayload } from './auth.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsResolverService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Re-reads the user, and re-resolves their permissions, on every request.
   * A token stays valid for 15 minutes, so without this a deactivated
   * account, a demoted staff member, or a permission an admin just revoked
   * from a role would keep working until the token expired.
   *
   * The account row is read fresh, so a deactivation is refused on the very
   * next request everywhere. The permission set comes through the cache
   * (208-l1-l2-l3-caching-architecture.md §2, ADR-077): a change takes effect
   * on the next request this replica serves after the write, and within 10 s
   * on any other replica.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, phone: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('This account is no longer active.');
    }

    const { roles, permissions } = await this.permissions.resolveForUserCached(user.id);

    return { id: user.id, roles, permissions, email: user.email, phone: user.phone };
  }
}

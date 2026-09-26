import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { hashAgencyApiKey } from './agency-key';
import type { PlatformTenant } from '../../core/prisma/client';

export interface RequestWithAgencyClient extends Request {
  agencyClient?: PlatformTenant;
}

/**
 * doc 14's own load-bearing security property, enforced here rather than
 * merely documented: "There is no endpoint that takes a client id as a
 * parameter — 'which client' is entirely determined by which key was
 * presented, so a leaked key can only ever read that one client's own
 * numbers." Every route this guards reads `req.agencyClient` for its
 * tenant id; none of them accept one from the client, the query string, or
 * the body — see `agency-reporting.controller.ts`.
 *
 * A new principal type in this codebase's own "actor with three tables"
 * terms: neither a `User`/`Party`/`Contact`/`TradingPartner` row nor an
 * ops key-hash principal (`PlatformOpsClient`) — a key-hash credential
 * carried directly on `PlatformTenant` itself, checked against no
 * permission catalogue at all (there is nothing to authorize beyond "which
 * one tenant is this"). Deliberately NOT `PlatformOpsClient`: that
 * principal is internal hosting-ops tooling with a permission catalogue
 * behind it; this one is a whole separate client deployment with exactly
 * one capability — read its own usage and invoices, nothing else, ever.
 */
@Injectable()
export class AgencyApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAgencyClient>();
    const header = request.headers['x-agency-api-key'];
    const rawKey = Array.isArray(header) ? header[0] : header;

    if (!rawKey) {
      throw new UnauthorizedException('Missing X-Agency-Api-Key header.');
    }

    const apiKeyHash = hashAgencyApiKey(rawKey, this.config.get('PLATFORM_AGENCY_KEY_PEPPER'));
    const tenant = await this.prisma.platformTenant.findUnique({ where: { apiKeyHash } });

    if (!tenant) {
      throw new UnauthorizedException('Agency API key is invalid or has been rotated.');
    }

    request.agencyClient = tenant;
    return true;
  }
}

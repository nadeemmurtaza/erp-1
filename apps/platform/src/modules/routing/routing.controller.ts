import { Controller, Get, NotFoundException, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { HostnameResolverService } from './hostname-resolver.service';
import { OpsAuthGuard } from '../../core/security/ops-auth.guard';
import { RequireOpsPermission } from '../../core/security/decorators';

/**
 * `resolve` is the one endpoint in this whole app doc 39's own "the
 * principal with no permission key" lens names explicitly: the reverse-
 * proxy layer calling it authenticates as infrastructure, not a `User` or
 * an ops principal, and it is given nothing beyond `RoutingInfo` — never a
 * credential, never another tenant's data. It stays outside `OpsAuthGuard`
 * on purpose; a request-rate limit (`ThrottlerGuard`, applied globally)
 * still bounds it.
 */
@Controller('routing')
export class RoutingController {
  constructor(
    private readonly resolver: HostnameResolverService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('resolve')
  async resolve(@Query('hostname') hostname: string) {
    if (!hostname) throw new NotFoundException('hostname query parameter is required.');
    const result = await this.resolver.resolve(hostname);
    if (!result) throw new NotFoundException(`No routable tenant for hostname "${hostname}".`);
    return result;
  }

  /**
   * Manual verification — real DNS TXT-record verification automation is
   * a separable, named integration this endpoint deliberately does not
   * invent: WO-39.3 scopes this document to resolution + cache
   * invalidation only. An ops principal confirms domain ownership through
   * whatever process it already uses today, then marks it here.
   */
  @Patch('tenants/:id/verify-domain')
  @UseGuards(OpsAuthGuard)
  @RequireOpsPermission('platform.tenants.manage')
  async verifyDomain(@Param('id') id: string) {
    const tenant = await this.prisma.platformTenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException(`No tenant with id ${id}`);
    if (!tenant.customDomain) throw new NotFoundException(`Tenant ${id} has no custom domain set.`);

    const updated = await this.prisma.platformTenant.update({
      where: { id },
      data: { customDomainVerifiedAt: new Date() },
    });
    this.resolver.invalidate(tenant.customDomain, this.resolver.subdomainFor(tenant.slug));
    return updated;
  }
}

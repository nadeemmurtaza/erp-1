import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { HostnameResolverService } from '../routing/hostname-resolver.service';
import type { PlatformTenant } from '../../core/prisma/client';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hostnameResolver: HostnameResolverService,
  ) {}

  /** Every hostname a tenant is reachable at — WO-39.3's own
   *  cache-invalidation-on-tenant-change obligation. */
  private hostnamesFor(tenant: Pick<PlatformTenant, 'slug' | 'customDomain'>): string[] {
    return [this.hostnameResolver.subdomainFor(tenant.slug), tenant.customDomain].filter((h): h is string => !!h);
  }

  async list(): Promise<PlatformTenant[]> {
    return this.prisma.platformTenant.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findBySlug(slug: string): Promise<PlatformTenant | null> {
    return this.prisma.platformTenant.findUnique({ where: { slug } });
  }

  async getById(id: string): Promise<PlatformTenant> {
    const tenant = await this.prisma.platformTenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException(`No tenant with id ${id}`);
    return tenant;
  }

  /**
   * Doc 39's "grant that ends itself" applied to a paying customer:
   * suspension is a status transition with a reason, never a delete — the
   * tenant's own isolated database is untouched, so restoring access
   * (WO-39.6/39.7's own territory) is a status flip back, not a rebuild.
   */
  async suspend(id: string, reason: string): Promise<PlatformTenant> {
    const tenant = await this.prisma.platformTenant.update({
      where: { id },
      data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: reason },
    });
    this.hostnameResolver.invalidate(...this.hostnamesFor(tenant));
    return tenant;
  }

  async reactivate(id: string): Promise<PlatformTenant> {
    const tenant = await this.prisma.platformTenant.update({
      where: { id },
      data: { status: 'ACTIVE', suspendedAt: null, suspendedReason: null },
    });
    this.hostnameResolver.invalidate(...this.hostnamesFor(tenant));
    return tenant;
  }
}

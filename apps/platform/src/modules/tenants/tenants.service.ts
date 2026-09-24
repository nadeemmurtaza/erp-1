import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { PlatformTenant } from '../../core/prisma/client';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.platformTenant.update({
      where: { id },
      data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: reason },
    });
  }

  async reactivate(id: string): Promise<PlatformTenant> {
    return this.prisma.platformTenant.update({
      where: { id },
      data: { status: 'ACTIVE', suspendedAt: null, suspendedReason: null },
    });
  }
}

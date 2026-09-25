import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import type { PlatformTenant, TrialExtension } from '../../core/prisma/client';

/**
 * WO-51.4 / WO-51.5 — the ops-authenticated half of trial management:
 * extending a trial (`platform.trials.extend`, deliberately narrower than
 * `platform.tenants.manage`) and converting one to a paying tenant.
 *
 * Conversion here is the sales-assisted path only — doc 51 §"conversion
 * flow" names a self-service checkout as the other route, which needs a
 * real payment gateway to capture money. Doc 50 itself never builds that
 * gateway either (its own text: "through whatever payment processor
 * invoices the tenant" — named, not built); a self-service checkout is
 * therefore a separable, larger capability this module does not silently
 * invent a payment flow for.
 */
@Injectable()
export class TrialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
  ) {}

  async extend(tenantId: string, newExpiresAt: Date, reason: string, extendedByOpsClientId: string): Promise<PlatformTenant> {
    const tenant = await this.prisma.platformTenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`No tenant with id ${tenantId}`);
    if (tenant.status !== 'TRIAL') throw new BadRequestException('Only a TRIAL tenant can have its trial extended.');
    if (!tenant.trialExpiresAt || newExpiresAt.getTime() <= tenant.trialExpiresAt.getTime()) {
      throw new BadRequestException('newExpiresAt must be later than the current trialExpiresAt.');
    }

    await this.prisma.trialExtension.create({
      data: { tenantId, previousExpiresAt: tenant.trialExpiresAt, newExpiresAt, reason, extendedByOpsClientId },
    });

    return this.prisma.platformTenant.update({ where: { id: tenantId }, data: { trialExpiresAt: newExpiresAt } });
  }

  /** Sales-assisted conversion: TRIAL -> ACTIVE. `trialExpiresAt` is left
   *  as historical record — billing gates on `status`, never on it. */
  async convert(tenantId: string): Promise<PlatformTenant> {
    const tenant = await this.prisma.platformTenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`No tenant with id ${tenantId}`);
    if (tenant.status !== 'TRIAL') throw new BadRequestException('Only a TRIAL tenant can be converted.');

    return this.prisma.platformTenant.update({ where: { id: tenantId }, data: { status: 'ACTIVE' } });
  }

  /** WO-51.3's own automatic transition, reusing `TenantsService.suspend`
   *  so it gets the exact same hostname-cache invalidation every other
   *  suspension already does. */
  async expireToSuspended(tenantId: string): Promise<PlatformTenant> {
    return this.tenants.suspend(tenantId, 'Trial expired without conversion');
  }

  async listExtensions(tenantId: string): Promise<TrialExtension[]> {
    return this.prisma.trialExtension.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  /** Doc 51's own soft policy signal: "a report naming every trial
   *  extended more than once." */
  async listExtendedMoreThanOnce(): Promise<{ tenantId: string; extensionCount: number }[]> {
    const grouped = await this.prisma.trialExtension.groupBy({
      by: ['tenantId'],
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } },
    });
    return grouped.map((g) => ({ tenantId: g.tenantId, extensionCount: g._count.id }));
  }

  async listTrials(): Promise<PlatformTenant[]> {
    return this.prisma.platformTenant.findMany({ where: { status: 'TRIAL' }, orderBy: { trialExpiresAt: 'asc' } });
  }
}

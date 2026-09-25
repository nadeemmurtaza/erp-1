import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantCredentialResolverService } from '../../core/tenant-credentials/tenant-credential-resolver.service';
import { TenantExportService } from './tenant-export.service';
import { DEPLOYMENT_PROVISIONER } from '../tenants/deployment-provisioner.token';
import type { DeploymentProvisioner } from '../tenants/deployment-provisioner';
import type { PlatformTenant } from '../../core/prisma/client';

/**
 * WO-39.7's own retention-window-then-delete sequence. A tenant becomes
 * eligible for actual teardown only once ALL of:
 *  - status is DEPROVISIONED,
 *  - `retentionExpiresAt` has passed,
 *  - `dataDeletedAt` is still null (not already torn down),
 *  - at least one export ever reached COMPLETE — doc 39's own acceptance
 *    ("a downloadable export before the retention window closes") made
 *    into a hard gate rather than a hoped-for ordering: this service
 *    refuses to be the reason a cancelled tenant's data is gone with no
 *    export ever having succeeded.
 *
 * Deliberately does NOT depend on `ProvisioningService` (which lives in
 * `TenantsModule`) — `TenantsModule` imports `TenantDataModule` to fire an
 * automatic export on deprovision, so the reverse dependency here would be
 * circular. This service owns its own `DEPLOYMENT_PROVISIONER` binding
 * (the same class, a second DI registration — see `TenantDataModule`'s own
 * comment) instead.
 */
@Injectable()
export class TenantRetentionService {
  private readonly logger = new Logger(TenantRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: TenantCredentialResolverService,
    private readonly exports: TenantExportService,
    @Inject(DEPLOYMENT_PROVISIONER) private readonly provisioner: DeploymentProvisioner,
  ) {}

  async listOverdueForTeardown(now: Date = new Date()): Promise<PlatformTenant[]> {
    return this.prisma.platformTenant.findMany({
      where: { status: 'DEPROVISIONED', retentionExpiresAt: { lte: now }, dataDeletedAt: null },
      orderBy: { retentionExpiresAt: 'asc' },
      // Bounded batch — doc 39's own "hundred-thousandth row" lens: this
      // sweep must never try to tear down an unbounded backlog in one run.
      take: 100,
    });
  }

  /** The sweep's own report of what it could NOT safely tear down — the
   *  failure-path lens: a durable, listable state, never a silent skip. */
  async listOverdueWithoutExport(now: Date = new Date()): Promise<PlatformTenant[]> {
    const overdue = await this.listOverdueForTeardown(now);
    const withoutExport: PlatformTenant[] = [];
    for (const tenant of overdue) {
      if (!(await this.exports.hasCompletedExport(tenant.id))) withoutExport.push(tenant);
    }
    return withoutExport;
  }

  async run(now: Date = new Date()): Promise<{ deleted: number; skippedNoExport: number }> {
    const overdue = await this.listOverdueForTeardown(now);
    let deleted = 0;
    let skippedNoExport = 0;

    for (const tenant of overdue) {
      if (!(await this.exports.hasCompletedExport(tenant.id))) {
        skippedNoExport++;
        this.logger.warn(`Tenant ${tenant.id} (${tenant.slug}) is past its retention window with no completed export — teardown skipped`);
        continue;
      }

      try {
        const connectionString = await this.credentials.resolveConnectionString(tenant.id);
        await this.provisioner.deprovision({ slug: tenant.slug, connectionString });
        await this.prisma.platformTenant.update({ where: { id: tenant.id }, data: { dataDeletedAt: now } });
        deleted++;
        this.logger.log(`Tore down isolated database for tenant ${tenant.id} (${tenant.slug}) — retention window closed`);
      } catch (error) {
        this.logger.error(`Failed to tear down tenant ${tenant.id} (${tenant.slug}) — will retry next sweep`, error);
      }
    }

    return { deleted, skippedNoExport };
  }
}

import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { PlatformNotificationsService } from '../../core/notifications/notifications.service';
import { TenantCredentialResolverService } from '../../core/tenant-credentials/tenant-credential-resolver.service';
import type { TenantDataExport, TenantExportTrigger } from '../../core/prisma/client';
import { TENANT_EXPORT_RUNNER } from './export-runner.token';
import type { TenantExportRunner } from './export-runner';

/**
 * WO-39.7 — doc 39 §4's own "data portability" commitment: any tenant may
 * be exported on demand, and a `DEPROVISION`-triggered one fires
 * automatically (see `ProvisioningService.deprovisionTenant()`) so
 * cancellation never silently means the data is already gone.
 *
 * "Self-serve" today means an ops-authenticated request made on a
 * tenant's behalf, not a tenant admin logging into this control plane
 * directly — doc 39's own schema has no tenant-login principal yet, only
 * `PlatformOpsClient` (a tool/service identity). A tenant-facing self-
 * service portal is real, separable UI work this service is ready for the
 * day that principal exists (this method takes only a `tenantId`, nothing
 * ops-specific), but it is not invented here.
 */
@Injectable()
export class TenantExportService {
  private readonly logger = new Logger(TenantExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly credentials: TenantCredentialResolverService,
    private readonly notifications: PlatformNotificationsService,
    @Inject(TENANT_EXPORT_RUNNER) private readonly runner: TenantExportRunner,
  ) {}

  async requestExport(tenantId: string, triggeredBy: TenantExportTrigger = 'MANUAL'): Promise<TenantDataExport> {
    const tenant = await this.prisma.platformTenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`No tenant with id ${tenantId}`);

    const exportRow = await this.prisma.tenantDataExport.create({ data: { tenantId, triggeredBy } });
    await this.runExport(exportRow.id);
    return this.prisma.tenantDataExport.findUniqueOrThrow({ where: { id: exportRow.id } });
  }

  private async runExport(exportId: string): Promise<void> {
    const exportRow = await this.prisma.tenantDataExport.update({
      where: { id: exportId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    const tenant = await this.prisma.platformTenant.findUniqueOrThrow({ where: { id: exportRow.tenantId } });

    try {
      const connectionString = await this.credentials.resolveConnectionString(tenant.id);
      const { storageKey, sizeBytes } = await this.runner.run({
        tenantSlug: tenant.slug,
        exportId,
        connectionString,
      });
      const ttlDays = this.config.get('PLATFORM_EXPORT_DOWNLOAD_TTL_DAYS');

      await this.prisma.tenantDataExport.update({
        where: { id: exportId },
        data: {
          status: 'COMPLETE',
          completedAt: new Date(),
          storageKey,
          sizeBytes: BigInt(sizeBytes),
          expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
        },
      });

      await this.notifications.send(
        tenant.billingContactEmail,
        'Your data export is ready',
        `Your requested export of "${tenant.legalName}" is ready and will remain available for ${ttlDays} days.`,
      );
    } catch (error) {
      this.logger.error(`Export ${exportId} failed for tenant ${tenant.id}`, error);
      await this.prisma.tenantDataExport.update({
        where: { id: exportId },
        data: { status: 'FAILED', failedAt: new Date(), failureReason: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  async getById(id: string): Promise<TenantDataExport> {
    const row = await this.prisma.tenantDataExport.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`No export with id ${id}`);
    return row;
  }

  async listForTenant(tenantId: string): Promise<TenantDataExport[]> {
    return this.prisma.tenantDataExport.findMany({ where: { tenantId }, orderBy: { requestedAt: 'desc' } });
  }

  /** Whether this tenant has at least one COMPLETE export ever — the
   *  retention/teardown cron's own safety gate (see TenantRetentionCron). */
  async hasCompletedExport(tenantId: string): Promise<boolean> {
    const count = await this.prisma.tenantDataExport.count({ where: { tenantId, status: 'COMPLETE' } });
    return count > 0;
  }
}

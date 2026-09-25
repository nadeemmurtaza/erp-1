import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { encryptSecret } from '@newax/shared/secret-crypto';
import { AppConfigService } from '../../core/config/app-config.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantCredentialResolverService } from '../../core/tenant-credentials/tenant-credential-resolver.service';
import { TenantExportService } from '../tenant-data/tenant-export.service';
import { HostnameResolverService } from '../routing/hostname-resolver.service';
import type { PlatformTenant } from '../../core/prisma/client';
import type { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { DEPLOYMENT_PROVISIONER } from './deployment-provisioner.token';
import { ProvisioningError, type DeploymentProvisioner } from './deployment-provisioner';

/**
 * WO-39.2 — provisioning automation. The one rule this whole service
 * exists to uphold, straight from doc 39's own failure-path lens: **a
 * failed provisioning attempt leaves the tenant at `PROVISIONING` with a
 * retryable action, never a half-created deployment nobody owns.** Every
 * step after the tenant row is created is safe to re-run: the database
 * provisioner is itself idempotent on the database name, the credential
 * write only happens once a connection string actually exists, and
 * activation only happens once the credential is safely stored.
 */
@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly credentials: TenantCredentialResolverService,
    private readonly exports: TenantExportService,
    private readonly hostnameResolver: HostnameResolverService,
    @Inject(DEPLOYMENT_PROVISIONER) private readonly provisioner: DeploymentProvisioner,
  ) {}

  /**
   * Idempotent on `slug` (doc 39's own acceptance criterion): a tenant
   * already `ACTIVE` is returned as-is; one still `PROVISIONING` resumes
   * from wherever it left off rather than starting over or erroring.
   */
  async provisionTenant(dto: ProvisionTenantDto): Promise<PlatformTenant> {
    const existing = await this.prisma.platformTenant.findUnique({ where: { slug: dto.slug } });

    if (existing?.status === 'ACTIVE' || existing?.status === 'TRIAL') {
      this.logger.log(`Tenant ${dto.slug} already ${existing.status} — idempotent no-op`);
      return existing;
    }
    if (existing?.status === 'SUSPENDED' || existing?.status === 'DEPROVISIONED') {
      throw new ConflictException(`Slug "${dto.slug}" belongs to a tenant that is ${existing.status}, not provisionable.`);
    }

    const plan = await this.prisma.platformPlan.findUnique({ where: { key: dto.planKey } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException(`No active plan with key "${dto.planKey}"`);
    }

    const tenant =
      existing ??
      (await this.prisma.platformTenant.create({
        data: {
          slug: dto.slug,
          legalName: dto.legalName,
          planId: plan.id,
          resourceTier: dto.resourceTier ?? plan.includedResourceTier,
          customDomain: dto.customDomain,
          billingContactEmail: dto.billingContactEmail,
        },
      }));

    const hasSubscription = await this.prisma.platformSubscription.findFirst({
      where: { tenantId: tenant.id, status: 'ACTIVE' },
    });
    if (!hasSubscription) {
      await this.prisma.platformSubscription.create({
        data: { tenantId: tenant.id, planId: plan.id },
      });
    }

    let connectionString: string;
    try {
      const result = await this.provisioner.provision({ slug: tenant.slug });
      connectionString = result.connectionString;
    } catch (error) {
      this.logger.error(`Provisioning failed for tenant ${tenant.slug} — left at PROVISIONING for retry`, error);
      throw error instanceof ProvisioningError ? error : new ProvisioningError('Provisioning failed', error);
    }

    const existingCredential = await this.prisma.tenantDeploymentCredential.findUnique({
      where: { tenantId: tenant.id },
    });
    const credential =
      existingCredential ??
      (await this.prisma.tenantDeploymentCredential.create({
        data: {
          tenantId: tenant.id,
          connectionStringEncrypted: encryptSecret(connectionString, this.config.get('PLATFORM_ENCRYPTION_KEY')),
        },
      }));

    const isTrial = !!dto.trialDays;
    const activated = await this.prisma.platformTenant.update({
      where: { id: tenant.id },
      data: {
        status: isTrial ? 'TRIAL' : 'ACTIVE',
        deploymentRef: credential.id,
        ...(isTrial ? { trialExpiresAt: new Date(Date.now() + dto.trialDays! * 24 * 60 * 60 * 1000) } : {}),
      },
    });
    this.hostnameResolver.invalidate(this.hostnameResolver.subdomainFor(activated.slug), activated.customDomain);
    return activated;
  }

  /**
   * Reads back a tenant's own connection string — used only by
   * infrastructure that legitimately needs it (a future admin console's
   * support-access flow, doc 39 §3), never returned by any read endpoint.
   */
  async resolveConnectionString(tenantId: string): Promise<string> {
    return this.credentials.resolveConnectionString(tenantId);
  }

  /**
   * Marks a tenant DEPROVISIONED. Deliberately does NOT drop the isolated
   * database or call `provisioner.deprovision()` directly — WO-39.7 owns
   * the export-then-retention-window-then-delete sequence
   * (`TenantRetentionCron`); doing that here would delete a paying
   * customer's data with no export step, which is exactly the "undo
   * fan-out" doc 39 names and refuses to leave implicit.
   *
   * What DOES happen here, synchronously: `retentionExpiresAt` is set
   * (shorter for a TRIAL tenant per doc 51 §"the hundred-thousandth row"),
   * and an automatic export fires — doc 39 §4's own "automatic
   * export-and-notify on cancellation." The status transition itself is
   * committed first; an export failure is logged and left for a retried
   * manual export (WO-39.7's own endpoint), never allowed to undo the
   * DEPROVISIONED transition that already happened.
   */
  async deprovisionTenant(id: string): Promise<PlatformTenant> {
    const before = await this.prisma.platformTenant.findUniqueOrThrow({ where: { id } });
    const retentionDays =
      before.status === 'TRIAL'
        ? this.config.get('PLATFORM_RETENTION_DAYS_TRIAL')
        : this.config.get('PLATFORM_RETENTION_DAYS_DEFAULT');

    const tenant = await this.prisma.platformTenant.update({
      where: { id },
      data: {
        status: 'DEPROVISIONED',
        deprovisionedAt: new Date(),
        retentionExpiresAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
      },
    });

    this.hostnameResolver.invalidate(this.hostnameResolver.subdomainFor(tenant.slug), tenant.customDomain);

    try {
      await this.exports.requestExport(id, 'DEPROVISION');
    } catch (error) {
      this.logger.error(`Automatic export-on-deprovision failed for tenant ${id} — retryable via the export endpoint`, error);
    }

    return tenant;
  }
}

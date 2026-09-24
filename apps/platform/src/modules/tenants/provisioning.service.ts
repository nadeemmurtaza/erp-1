import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { encryptSecret, decryptSecret } from '@newax/shared';
import { AppConfigService } from '../../core/config/app-config.service';
import { PrismaService } from '../../core/prisma/prisma.service';
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
    @Inject(DEPLOYMENT_PROVISIONER) private readonly provisioner: DeploymentProvisioner,
  ) {}

  /**
   * Idempotent on `slug` (doc 39's own acceptance criterion): a tenant
   * already `ACTIVE` is returned as-is; one still `PROVISIONING` resumes
   * from wherever it left off rather than starting over or erroring.
   */
  async provisionTenant(dto: ProvisionTenantDto): Promise<PlatformTenant> {
    const existing = await this.prisma.platformTenant.findUnique({ where: { slug: dto.slug } });

    if (existing?.status === 'ACTIVE') {
      this.logger.log(`Tenant ${dto.slug} already ACTIVE — idempotent no-op`);
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

    return this.prisma.platformTenant.update({
      where: { id: tenant.id },
      data: { status: 'ACTIVE', deploymentRef: credential.id },
    });
  }

  /**
   * Reads back a tenant's own connection string — used only by
   * infrastructure that legitimately needs it (a future admin console's
   * support-access flow, doc 39 §3), never returned by any read endpoint.
   */
  async resolveConnectionString(tenantId: string): Promise<string> {
    const credential = await this.prisma.tenantDeploymentCredential.findUnique({ where: { tenantId } });
    if (!credential) throw new NotFoundException(`No deployment credential for tenant ${tenantId}`);
    return decryptSecret(credential.connectionStringEncrypted, this.config.get('PLATFORM_ENCRYPTION_KEY'));
  }

  /**
   * Marks a tenant DEPROVISIONED. Deliberately does NOT drop the isolated
   * database or call `provisioner.deprovision()` — doc 39 WO-39.7 owns the
   * export-then-retention-window-then-delete sequence; calling that here
   * would delete a paying customer's data with no export step, which is
   * exactly the "undo fan-out" doc 39 names and refuses to leave implicit.
   */
  async deprovisionTenant(id: string): Promise<PlatformTenant> {
    return this.prisma.platformTenant.update({
      where: { id },
      data: { status: 'DEPROVISIONED', deprovisionedAt: new Date() },
    });
  }
}

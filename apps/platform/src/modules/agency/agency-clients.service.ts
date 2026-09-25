import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { generateAgencyApiKey, hashAgencyApiKey } from './agency-key';
import type { RegisterAgencyClientDto, UpdateAgencyClientDto } from './dto/register-agency-client.dto';
import type { PlatformTenant } from '../../core/prisma/client';

/**
 * WO-14.1 — the ops-facing half of doc 14. Per ADR-039 this never creates a
 * new entity: every method here reads or writes fields on an EXISTING
 * `PlatformTenant` row (provisioned through `TenantsController`/
 * `ProvisioningService` already). "Registering an agency client" is
 * setting `apiKeyHash` (and optionally `mailDomain`/Stripe ids) on that
 * row for the first time; a tenant with `apiKeyHash: null` is simply not
 * onboarded to the managed-services dashboard yet — see
 * `PlatformTenant.apiKeyHash`'s own doc comment for why that nullability
 * IS the "is this an agency client" predicate everywhere else in this
 * module reads it.
 */
@Injectable()
export class AgencyClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /** Every tenant onboarded to the managed-services dashboard — i.e. every
   *  row this module's nightly job and reporting API ever touch. */
  async list(): Promise<PlatformTenant[]> {
    return this.prisma.platformTenant.findMany({
      where: { apiKeyHash: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getRegisteredById(id: string): Promise<PlatformTenant> {
    const tenant = await this.prisma.platformTenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException(`No tenant with id ${id}`);
    if (!tenant.apiKeyHash) throw new NotFoundException(`Tenant ${id} is not registered for managed services`);
    return tenant;
  }

  async getById(id: string): Promise<PlatformTenant> {
    return this.getRegisteredById(id);
  }

  /**
   * Mints a fresh `AGENCY_API_KEY`, stores only its hash, and returns the
   * plaintext exactly once — same discipline as every other credential in
   * this codebase (doc 14's own security note: "there is no endpoint to
   * retrieve a lost key"). Refuses a tenant already registered — that's
   * what `rotateKey()` is for, so a double `register()` call can never
   * silently orphan the key a client's `.env` already has.
   */
  async register(tenantId: string, dto: RegisterAgencyClientDto): Promise<{ tenant: PlatformTenant; apiKey: string }> {
    const tenant = await this.prisma.platformTenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`No tenant with id ${tenantId}`);
    if (tenant.apiKeyHash) {
      throw new BadRequestException(`Tenant ${tenantId} is already registered for managed services — use rotate-key instead.`);
    }

    const apiKey = generateAgencyApiKey();
    const apiKeyHash = hashAgencyApiKey(apiKey, this.config.get('PLATFORM_AGENCY_KEY_PEPPER'));

    const updated = await this.prisma.platformTenant.update({
      where: { id: tenantId },
      data: {
        apiKeyHash,
        apiKeyRotatedAt: new Date(),
        mailDomain: dto.mailDomain,
        stripeCustomerId: dto.stripeCustomerId,
        stripeSubscriptionId: dto.stripeSubscriptionId,
      },
    });

    return { tenant: updated, apiKey };
  }

  /** doc 14's own "no endpoint recovers a lost key — only rotates it": the
   *  old hash stops matching the instant this writes, so a leaked/lost key
   *  is invalidated by the same call that issues its replacement. */
  async rotateKey(tenantId: string): Promise<{ tenant: PlatformTenant; apiKey: string }> {
    await this.getRegisteredById(tenantId);

    const apiKey = generateAgencyApiKey();
    const apiKeyHash = hashAgencyApiKey(apiKey, this.config.get('PLATFORM_AGENCY_KEY_PEPPER'));

    const updated = await this.prisma.platformTenant.update({
      where: { id: tenantId },
      data: { apiKeyHash, apiKeyRotatedAt: new Date() },
    });

    return { tenant: updated, apiKey };
  }

  async update(tenantId: string, dto: UpdateAgencyClientDto): Promise<PlatformTenant> {
    await this.getRegisteredById(tenantId);
    return this.prisma.platformTenant.update({
      where: { id: tenantId },
      data: {
        mailDomain: dto.mailDomain,
        stripeCustomerId: dto.stripeCustomerId,
        stripeSubscriptionId: dto.stripeSubscriptionId,
      },
    });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { decryptSecret } from '@newax/shared/secret-crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';

/**
 * The one place a tenant's own connection string is decrypted — shared by
 * `ProvisioningService` (support-access infra) and `TenantExportService`
 * (WO-39.7) and `SeatCounterService` (doc 50's `countBillableSeats()`) so
 * none of them duplicate `TenantDeploymentCredential` decryption, and so
 * none of doc 39's/doc 50's tenant-database readers need to depend on each
 * other's Nest module just to reach this one read — which would create a
 * circular module import (tenants <-> tenant-data <-> billing) for a
 * three-line credential lookup. Kept in `core/`, not `modules/tenants/`,
 * for exactly that reason.
 */
@Injectable()
export class TenantCredentialResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async resolveConnectionString(tenantId: string): Promise<string> {
    const credential = await this.prisma.tenantDeploymentCredential.findUnique({ where: { tenantId } });
    if (!credential) throw new NotFoundException(`No deployment credential for tenant ${tenantId}`);
    return decryptSecret(credential.connectionStringEncrypted, this.config.get('PLATFORM_ENCRYPTION_KEY'));
  }
}

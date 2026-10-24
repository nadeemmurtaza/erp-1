import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'pg';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantCredentialResolverService } from '../../core/tenant-credentials/tenant-credential-resolver.service';
import { StalwartAdminClient } from './stalwart-admin.client';

const CONNECT_STATEMENT_TIMEOUT_MS = 10_000;

function truncateToUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * WO-14.2 — the nightly usage-snapshot job's own reads. Follows
 * `SeatCounterService.countBillableSeats()`'s exact discipline (doc 14's
 * own instruction to read it before writing this): one short-lived
 * connection per tenant, opened, queried once, closed — never a pooled or
 * long-lived connection to a tenant's own database, and nothing read here
 * is ever anything but a single aggregate number.
 */
@Injectable()
export class AgencyUsageService {
  private readonly logger = new Logger(AgencyUsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: TenantCredentialResolverService,
    private readonly stalwart: StalwartAdminClient,
  ) {}

  /** Every tenant this job's nightly sweep covers — onboarded to the
   *  managed-services dashboard (`apiKeyHash` set) and not yet torn down. */
  async listRegisteredTenantIds(): Promise<string[]> {
    const tenants = await this.prisma.platformTenant.findMany({
      where: { apiKeyHash: { not: null }, status: { not: 'DEPROVISIONED' } },
      select: { id: true },
    });
    return tenants.map((t) => t.id);
  }

  private async readDatabaseBytes(tenantId: string): Promise<number> {
    const connectionString = await this.credentials.resolveConnectionString(tenantId);
    const client = new Client({ connectionString, statement_timeout: CONNECT_STATEMENT_TIMEOUT_MS });
    await client.connect();
    try {
      const result = await client.query<{ size: string }>(
        `SELECT pg_database_size(current_database())::text AS size`,
      );
      return Number(result.rows[0]?.size ?? '0');
    } finally {
      await client.end();
    }
  }

  private async readActiveUsers30d(tenantId: string): Promise<number> {
    const connectionString = await this.credentials.resolveConnectionString(tenantId);
    const client = new Client({ connectionString, statement_timeout: CONNECT_STATEMENT_TIMEOUT_MS });
    await client.connect();
    try {
      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "User" WHERE "lastLoginAt" >= now() - interval '30 days'`,
      );
      return Number(result.rows[0]?.count ?? '0');
    } finally {
      await client.end();
    }
  }

  /**
   * One tenant's nightly snapshot — upserted on `(tenantId, snapshotDate)`
   * so a job rerun on the same UTC day is a no-op, never a second row
   * (doc 14's own acceptance criterion). `databaseBytes`/`activeUsers30d`
   * are read independently of the Stalwart leg; a failure on one metric
   * never blocks the others ("the absent collaborator" / "four hours
   * down" lenses — this tenant's snapshot for tonight is simply incomplete
   * rather than entirely skipped, except where the tenant's OWN database
   * is unreachable, in which case the whole snapshot defers to tomorrow
   * night exactly like `BillingService.issueInvoiceForPeriod`'s own
   * per-tenant deferral).
   */
  async captureSnapshotForTenant(tenantId: string): Promise<void> {
    const tenant = await this.prisma.platformTenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return;

    let databaseBytes: number;
    let activeUsers30d: number;
    try {
      [databaseBytes, activeUsers30d] = await Promise.all([
        this.readDatabaseBytes(tenantId),
        this.readActiveUsers30d(tenantId),
      ]);
    } catch (error) {
      this.logger.error(`Usage snapshot deferred for tenant ${tenantId} — could not reach its own database — ${error instanceof Error ? error.message : error}`);
      return;
    }

    const emailsSent30d = tenant.mailDomain ? await this.stalwart.getSentCount30d(tenant.mailDomain) : null;
    const snapshotDate = truncateToUtcDay(new Date());

    await this.prisma.agencyUsageSnapshot.upsert({
      where: { tenantId_snapshotDate: { tenantId, snapshotDate } },
      create: {
        tenantId,
        snapshotDate,
        databaseBytes: BigInt(databaseBytes),
        activeUsers30d,
        emailsSent30d,
      },
      update: {
        capturedAt: new Date(),
        databaseBytes: BigInt(databaseBytes),
        activeUsers30d,
        emailsSent30d,
      },
    });
  }
}

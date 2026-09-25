import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'pg';
import { TenantCredentialResolverService } from '../../core/tenant-credentials/tenant-credential-resolver.service';

/**
 * WO-50.2 — `countBillableSeats()`. Doc 50 §2's own words: "this is the one
 * place doc 39's own shared-infrastructure/isolated-data boundary is
 * deliberately, narrowly crossed... The count crosses the boundary; the
 * tenant's own data never does."
 *
 * Enforced here, not merely documented:
 *  - The ONLY query this class ever runs is the single read-only COUNT
 *    below — no second query, no `SELECT *`, nothing that could return a
 *    row of the tenant's own business data to this process.
 *  - Nothing this method returns is ever written back into any
 *    control-plane table as a cache — callers (`BillingService`) use the
 *    number immediately to compute one invoice and discard it; the
 *    `PlatformInvoice.seatCount` column that DOES persist a copy is a
 *    snapshot of an already-issued invoice's own basis (doc 50's "click
 *    the number" lens), not a live cache of the tenant's user table.
 *  - The connection is opened, queried once, and closed in the same call
 *    — no pooled, long-lived connection to a tenant's database is kept by
 *    this control plane.
 *
 * "Active staff Users" — `User.role` (the old fixed enum) is documented in
 * apps/api's own schema as superseded by the `UserRoleAssignment`/`Role`
 * RBAC system that "nothing in PermissionsResolverService reads" any more;
 * counting by that legacy enum would silently stop being correct the day
 * apps/api's own seed data changes. A billable seat is instead: an
 * `isActive` `User` who holds at least one `UserRoleAssignment` — i.e. has
 * actually been granted an operational role, which a customer-facing
 * shopper is never given. Service/API accounts are a non-issue by
 * construction: this schema models those as `TradingPartner`/`ApiClient`-
 * style key-hash principals, never as `User` rows.
 */
@Injectable()
export class SeatCounterService {
  private readonly logger = new Logger(SeatCounterService.name);

  constructor(private readonly credentials: TenantCredentialResolverService) {}

  async countBillableSeats(tenantId: string): Promise<number> {
    const connectionString = await this.credentials.resolveConnectionString(tenantId);
    const client = new Client({ connectionString, statement_timeout: 10_000 });
    await client.connect();
    try {
      const result = await client.query<{ count: string }>(
        `SELECT COUNT(DISTINCT u.id)::text AS count
           FROM "User" u
          WHERE u."isActive" = true
            AND EXISTS (SELECT 1 FROM "UserRoleAssignment" ura WHERE ura."userId" = u.id)`,
      );
      return Number(result.rows[0]?.count ?? '0');
    } catch (error) {
      this.logger.error(`countBillableSeats failed for tenant ${tenantId}`, error);
      throw error;
    } finally {
      await client.end();
    }
  }
}

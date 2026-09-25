import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';

const USAGE_WINDOW_DAYS = 30;

/**
 * WO-14.3's read-only half. Every method here takes the tenant id the
 * `AgencyApiKeyGuard` already resolved (`CurrentAgencyClient()`) — never a
 * caller-supplied id — so the query itself is the enforcement, not just
 * the guard in front of it: even a bug that let a bad id through here
 * would still only ever be THIS tenant's own id.
 */
@Injectable()
export class AgencyReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /** doc 14's "renders: current plan/status, the last 30 days of storage
   *  and email usage" — one call, so the client-side page never has to
   *  reconcile two separately-fetched views of the same tenant. */
  async usage(tenantId: string) {
    const [tenant, snapshots] = await Promise.all([
      this.prisma.platformTenant.findUniqueOrThrow({ where: { id: tenantId }, include: { plan: true } }),
      this.prisma.agencyUsageSnapshot.findMany({
        where: { tenantId, snapshotDate: { gte: new Date(Date.now() - USAGE_WINDOW_DAYS * 86_400_000) } },
        orderBy: { snapshotDate: 'desc' },
      }),
    ]);

    return {
      status: tenant.status,
      planKey: tenant.plan.key,
      resourceTier: tenant.resourceTier,
      snapshots,
    };
  }

  /** `currency` travels WITH every invoice amount rather than being a
   *  client-side assumption — `PLATFORM_BILLING_CURRENCY` is this control
   *  plane's own config, never a literal the client's `managed-services`
   *  page would otherwise have to hardcode (Law 1). */
  async invoices(tenantId: string): Promise<{ currency: string; invoices: unknown[] }> {
    const invoices = await this.prisma.platformInvoice.findMany({
      where: { tenantId },
      orderBy: { periodStart: 'desc' },
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        amountMinor: true,
        status: true,
        issuedAt: true,
        dueAt: true,
        stripeHostedInvoiceUrl: true,
        stripePaymentStatus: true,
      },
    });
    return { currency: this.config.get('PLATFORM_BILLING_CURRENCY'), invoices };
  }
}

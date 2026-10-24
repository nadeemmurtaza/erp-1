import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { PlatformNotificationsService } from '../../core/notifications/notifications.service';
import { SeatCounterService } from './seat-counter.service';
import { UsageMeteringService } from './usage-metering.service';
import type { PlatformInvoice, PlatformPlan, PlatformTenant } from '../../core/prisma/client';

/** doc 153's own "click the number": one line per metered dimension this
 *  charge actually included, each traceable back to its own UsageMeter
 *  metric — never an opaque total. */
export interface UsageLine {
  metric: string;
  quantity: number;
  rateMinorPerUnit?: number;
  allowance?: number;
  amountMinor: number;
}

export interface UsageBreakdown {
  transactionFeeMinor: number;
  lines: UsageLine[];
}

export interface InvoicePreview {
  tenantId: string;
  pricingModel: string;
  periodStart: Date;
  periodEnd: Date;
  seatCount: number | null;
  amountMinor: number;
  computedAt: Date;
  usageBreakdown?: UsageBreakdown;
}

/**
 * WO-50.3 — the billing job. Computes and issues the correct charge per
 * `PlatformPlan.pricingModel`, one invoice per tenant per period,
 * idempotent on `PlatformInvoice`'s own `@@unique([tenantId, periodStart,
 * periodEnd])`. Every price used is snapshotted onto the invoice at issue
 * time (doc 50's own "the version stamp": a later plan-price edit never
 * reprices a past invoice).
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly seatCounter: SeatCounterService,
    private readonly notifications: PlatformNotificationsService,
    private readonly usageMetering: UsageMeteringService,
    private readonly config: AppConfigService,
  ) {}

  /** Doc 50's own "dry run before live": computes what a tenant's next
   *  invoice would be, with no write — the same pricing logic
   *  `issueInvoiceForPeriod` uses, called read-only. For USAGE_BASED this
   *  reads the SAME `UsageMeter` rows the real invoice reads (doc 153's
   *  own acceptance criterion: preview and invoice must agree exactly). */
  async previewInvoice(tenantId: string, periodStart: Date, periodEnd: Date): Promise<InvoicePreview> {
    const tenant = await this.prisma.platformTenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
    if (!tenant) throw new NotFoundException(`No tenant with id ${tenantId}`);

    const charge = await this.computeCharge(tenant, tenant.plan, periodStart);
    return {
      tenantId,
      pricingModel: tenant.plan.pricingModel,
      periodStart,
      periodEnd,
      seatCount: charge.seatCount,
      amountMinor: charge.amountMinor,
      computedAt: new Date(),
      usageBreakdown: charge.usageBreakdown,
    };
  }

  private async computeCharge(
    tenant: PlatformTenant,
    plan: PlatformPlan,
    periodStart: Date,
  ): Promise<{ amountMinor: number; seatCount: number | null; usageBreakdown?: UsageBreakdown }> {
    switch (plan.pricingModel) {
      case 'PER_SEAT': {
        if (plan.perSeatPriceMinor == null) {
          throw new BadRequestException(`Plan ${plan.key} is PER_SEAT but has no perSeatPriceMinor set.`);
        }
        const seatCount = await this.seatCounter.countBillableSeats(tenant.id);
        return { amountMinor: seatCount * plan.perSeatPriceMinor, seatCount };
      }
      case 'ONE_TIME_LICENSE': {
        if (plan.oneTimeLicenseMinor == null) {
          throw new BadRequestException(`Plan ${plan.key} is ONE_TIME_LICENSE but has no oneTimeLicenseMinor set.`);
        }
        return { amountMinor: plan.oneTimeLicenseMinor, seatCount: null };
      }
      case 'USAGE_BASED': {
        const usageBreakdown = await this.computeUsageBreakdown(tenant.id, plan, periodStart);
        const linesTotal = usageBreakdown.lines.reduce((sum, line) => sum + line.amountMinor, 0);
        return { amountMinor: usageBreakdown.transactionFeeMinor + linesTotal, seatCount: null, usageBreakdown };
      }
      case 'FLAT_MONTHLY':
      default:
        return { amountMinor: plan.monthlyPriceMinor, seatCount: null };
    }
  }

  /** doc 153 §1 — the transaction fee (read directly off the meter, no
   *  further math) plus a line per per-unit rate-card metric plus a line
   *  per allowance dimension crossed. Reads `UsageMeter` only — never
   *  touches a tenant's own database, and never writes anything itself
   *  (this IS the "dry run" function every caller, live or preview, shares). */
  private async computeUsageBreakdown(tenantId: string, plan: PlatformPlan, periodStart: Date): Promise<UsageBreakdown> {
    const meters = await this.usageMetering.getMetersForPeriod(tenantId, periodStart);
    const transactionFeeMinor = meters.get('transaction_fee_minor') ?? 0;

    const rateCard = (plan.usageRateCardMinor as Record<string, number> | null) ?? {};
    const allowances = (plan.includedAllowances as Record<string, number> | null) ?? {};
    const lines: UsageLine[] = [];

    const messagesSent = meters.get('messages_sent') ?? 0;
    const messagesRateMinor = rateCard.messages_sent ?? 0;
    if (messagesSent > 0 || messagesRateMinor > 0) {
      lines.push({
        metric: 'messages_sent',
        quantity: messagesSent,
        rateMinorPerUnit: messagesRateMinor,
        amountMinor: messagesSent * messagesRateMinor,
      });
    }

    for (const [dimension, allowance] of Object.entries(allowances)) {
      const observed = meters.get(`${dimension}_count`) ?? 0;
      if (observed > allowance) {
        const overFeeMinor = rateCard[`${dimension}_over_limit`] ?? 0;
        lines.push({
          metric: `${dimension}_count`,
          quantity: observed,
          allowance,
          amountMinor: overFeeMinor,
        });
      }
    }

    return { transactionFeeMinor, lines };
  }

  /**
   * Issues (or returns the already-issued) invoice for one tenant/period.
   * A `ONE_TIME_LICENSE` tenant is billed exactly once, ever — checked
   * against the whole invoice history, not just this period, and its
   * subscription is closed out so a later run never even considers it
   * again (belt-and-braces alongside the per-period unique constraint,
   * which alone would still allow a *second* one-time charge in a
   * *different* period).
   */
  async issueInvoiceForPeriod(tenantId: string, periodStart: Date, periodEnd: Date): Promise<PlatformInvoice | null> {
    const tenant = await this.prisma.platformTenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
    if (!tenant) throw new NotFoundException(`No tenant with id ${tenantId}`);
    const plan = tenant.plan;

    const existingForPeriod = await this.prisma.platformInvoice.findUnique({
      where: { tenantId_periodStart_periodEnd: { tenantId, periodStart, periodEnd } },
    });
    if (existingForPeriod) return existingForPeriod;

    if (plan.pricingModel === 'ONE_TIME_LICENSE') {
      const everBilled = await this.prisma.platformInvoice.findFirst({
        where: { tenantId, pricingModel: 'ONE_TIME_LICENSE' },
      });
      if (everBilled) return null; // already billed once, ever — never a second charge
    }

    let charge: { amountMinor: number; seatCount: number | null; usageBreakdown?: UsageBreakdown };
    try {
      charge = await this.computeCharge(tenant, plan, periodStart);
    } catch (error) {
      // "Four hours down": a seat-count read that cannot reach a tenant's
      // database defers THAT tenant's invoice to the next run, never
      // throws for every other tenant in the same billing pass.
      this.logger.error(`Deferred invoicing for tenant ${tenantId}, period ${periodStart.toISOString()} — ${error instanceof Error ? error.message : error}`);
      return null;
    }

    const computedAt = new Date();
    const subscription = await this.prisma.platformSubscription.findFirst({
      where: { tenantId, status: 'ACTIVE' },
      orderBy: { startedOn: 'desc' },
    });

    const dueAt = new Date(computedAt.getTime() + this.config.get('PLATFORM_INVOICE_NET_TERMS_DAYS') * 86_400_000);

    const invoice = await this.prisma.platformInvoice.create({
      data: {
        tenantId,
        subscriptionId: subscription?.id,
        planId: plan.id,
        pricingModel: plan.pricingModel,
        periodStart,
        periodEnd,
        amountMinor: charge.amountMinor,
        seatCount: charge.seatCount,
        seatPriceMinorSnapshot: plan.pricingModel === 'PER_SEAT' ? plan.perSeatPriceMinor : null,
        flatPriceMinorSnapshot: plan.pricingModel === 'FLAT_MONTHLY' ? plan.monthlyPriceMinor : null,
        oneTimePriceMinorSnapshot: plan.pricingModel === 'ONE_TIME_LICENSE' ? plan.oneTimeLicenseMinor : null,
        transactionFeeMinorSnapshot: plan.pricingModel === 'USAGE_BASED' ? charge.usageBreakdown!.transactionFeeMinor : null,
        usageRateCardSnapshot:
          plan.pricingModel === 'USAGE_BASED'
            ? { transactionFeeBps: plan.transactionFeeBps, usageRateCardMinor: plan.usageRateCardMinor, includedAllowances: plan.includedAllowances }
            : undefined,
        usageLinesSnapshot: plan.pricingModel === 'USAGE_BASED' ? (charge.usageBreakdown!.lines as unknown as object) : undefined,
        computedAt,
        dueAt,
      },
    });

    if (plan.pricingModel === 'ONE_TIME_LICENSE' && subscription) {
      await this.prisma.platformSubscription.update({
        where: { id: subscription.id },
        data: { status: 'CANCELLED', endedOn: computedAt },
      });
    }

    await this.notifications.send(
      tenant.billingContactEmail,
      `Invoice for ${tenant.legalName}`,
      `Your invoice for ${periodStart.toDateString()}–${periodEnd.toDateString()} is ${(charge.amountMinor / 100).toFixed(2)}.`,
    );

    return invoice;
  }

  /** WO-50.3's own run — every ACTIVE tenant (never TRIAL, which doc 51
   *  says carries no charge until it converts; never SUSPENDED/
   *  PROVISIONING/DEPROVISIONED). */
  async runBillingForPeriod(periodStart: Date, periodEnd: Date): Promise<{ issued: number; skipped: number; deferred: number }> {
    const tenants = await this.prisma.platformTenant.findMany({ where: { status: 'ACTIVE' } });
    let issued = 0;
    let skippedOrDeferred = 0;

    for (const tenant of tenants) {
      const before = await this.prisma.platformInvoice.count({
        where: { tenantId: tenant.id, periodStart, periodEnd },
      });
      const result = await this.issueInvoiceForPeriod(tenant.id, periodStart, periodEnd);
      if (result && before === 0) issued++;
      else if (!result) skippedOrDeferred++;
    }

    this.logger.log(`Billing run ${periodStart.toISOString()}–${periodEnd.toISOString()}: issued ${issued}, skipped/deferred ${skippedOrDeferred}`);
    return { issued, skipped: skippedOrDeferred, deferred: 0 };
  }

  async issueCreditNote(invoiceId: string, amountMinor: number, reason: string, issuedByOpsClientId?: string) {
    const invoice = await this.prisma.platformInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException(`No invoice with id ${invoiceId}`);

    const [creditNote] = await this.prisma.$transaction([
      this.prisma.platformInvoiceCreditNote.create({
        data: { invoiceId, amountMinor, reason, issuedByOpsClientId },
      }),
      this.prisma.platformInvoice.update({ where: { id: invoiceId }, data: { status: 'CREDITED' } }),
    ]);
    return creditNote;
  }

  async listInvoicesForTenant(tenantId: string) {
    return this.prisma.platformInvoice.findMany({
      where: { tenantId },
      orderBy: { periodStart: 'desc' },
      include: { creditNotes: true },
    });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AgencyStripeService } from './agency-stripe.service';

/**
 * WO-14.4's own bridge — deliberately a SEPARATE, decoupled sweep rather
 * than a hook inside `BillingService.issueInvoiceForPeriod()` (billing
 * module). Selecting by `stripeInvoiceId: null` means this cron can be
 * added, changed or removed without touching `billing.service.ts`'s
 * already-tested invoice-computation code at all — the same
 * change-minimization + module-independence reasoning
 * `UsageMeteringCron`/`InvoiceDunningCron` already apply to
 * `PlatformInvoice` from outside `BillingService` itself.
 */
@Injectable()
export class AgencyStripeChargeCron {
  private readonly logger = new Logger(AgencyStripeChargeCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeAgency: AgencyStripeService,
  ) {}

  @Cron('0 */15 * * * *')
  async run(): Promise<void> {
    const uncharged = await this.prisma.platformInvoice.findMany({
      where: { stripeInvoiceId: null, tenant: { stripeCustomerId: { not: null } } },
      include: { tenant: true },
    });

    let charged = 0;
    for (const invoice of uncharged) {
      try {
        await this.stripeAgency.chargeInvoice(invoice.tenant, invoice);
        charged++;
      } catch (error) {
        this.logger.error(`Stripe charge sweep failed for invoice ${invoice.id} — ${error instanceof Error ? error.message : error}`);
      }
    }

    if (uncharged.length > 0) this.logger.log(`Stripe charge sweep: ${charged}/${uncharged.length} invoice(s) charged`);
  }
}

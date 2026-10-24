import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { TenantsService } from '../tenants/tenants.service';
import type { PlatformInvoice, PlatformTenant } from '../../core/prisma/client';

/**
 * WO-14.4 — real money collection for an agency-managed tenant's own
 * hosting invoice. Per ADR-039 this bridges the ALREADY-authoritative
 * `PlatformInvoice` row (computed by `BillingService`, doc 50/153) onto
 * Stripe rather than recomputing or re-storing the charge anywhere else:
 * this service's only write to `PlatformInvoice` is the Stripe linkage
 * columns ADR-039 added, never `amountMinor` or any other snapshot field.
 *
 * Degrades honestly when unconfigured: `PLATFORM_STRIPE_SECRET_KEY` unset
 * means `chargeInvoice()`/`handleWebhookEvent()` are no-ops — an
 * agency-managed tenant with no Stripe linkage is billed exactly as before
 * this module existed (internally tracked, never charged), the same
 * "absent collaborator" degrade `PlatformNotificationsService` already
 * documents for unset SMTP.
 */
@Injectable()
export class AgencyStripeService {
  private readonly logger = new Logger(AgencyStripeService.name);
  private stripeClient: Stripe | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly tenants: TenantsService,
  ) {}

  private client(): Stripe | null {
    const secretKey = this.config.get('PLATFORM_STRIPE_SECRET_KEY');
    if (!secretKey) return null;
    if (!this.stripeClient) this.stripeClient = new Stripe(secretKey);
    return this.stripeClient;
  }

  /**
   * Creates and finalizes a real Stripe invoice for one already-issued,
   * not-yet-charged `PlatformInvoice` — called only by
   * `AgencyStripeChargeCron`, which selects rows by `stripeInvoiceId: null`,
   * so a redelivered/rerun sweep never double-charges the same invoice
   * (doc 14's own "second copy of the write").
   */
  async chargeInvoice(tenant: PlatformTenant, invoice: PlatformInvoice): Promise<void> {
    const stripe = this.client();
    if (!stripe || !tenant.stripeCustomerId) return;

    const currency = this.config.get('PLATFORM_BILLING_CURRENCY');
    const description = `Hosting — ${invoice.periodStart.toISOString().slice(0, 10)} to ${invoice.periodEnd.toISOString().slice(0, 10)}`;

    try {
      await stripe.invoiceItems.create({
        customer: tenant.stripeCustomerId,
        amount: invoice.amountMinor,
        currency,
        description,
      });

      const draft = await stripe.invoices.create({
        customer: tenant.stripeCustomerId,
        collection_method: 'send_invoice',
        days_until_due: this.config.get('PLATFORM_INVOICE_NET_TERMS_DAYS'),
        auto_advance: true,
        description,
      });

      const finalized = await stripe.invoices.finalizeInvoice(draft.id);

      await this.prisma.platformInvoice.update({
        where: { id: invoice.id },
        data: {
          stripeInvoiceId: finalized.id,
          stripeHostedInvoiceUrl: finalized.hosted_invoice_url ?? null,
          stripePaymentStatus: 'PENDING',
        },
      });
    } catch (error) {
      // Left for the next cron pass — `stripeInvoiceId` is still null, so
      // this is a deferral, never a partial/duplicate charge.
      this.logger.error(`Stripe charge deferred for invoice ${invoice.id} (tenant ${tenant.id}) — ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Verifies and applies one Stripe webhook delivery. Fail-closed exactly
   * like `NidVerificationProvider.handleCallback()`: no secret configured,
   * or a signature that does not verify, means the event is logged and
   * dropped, never applied unverified.
   *
   * `customer.subscription.updated` is deliberately logged only — this
   * control plane never auto-deprovisions or auto-cancels a tenant from a
   * webhook; `invoice.paid`/`invoice.payment_failed` already cover the
   * concrete status transitions doc 14 asks for (reactivate / suspend),
   * and a subscription cancellation is a decision for
   * `platform.tenants.manage` to act on deliberately, not a webhook to act
   * on automatically (this codebase's own "no deletion/no destructive
   * action without a human" discipline, applied to the platform's own
   * paying customers).
   */
  async handleWebhookEvent(rawBody: string | Buffer, signature: string): Promise<void> {
    const stripe = this.client();
    const webhookSecret = this.config.get('PLATFORM_STRIPE_WEBHOOK_SECRET');
    if (!stripe || !webhookSecret) {
      this.logger.error('Stripe webhook rejected: PLATFORM_STRIPE_SECRET_KEY/PLATFORM_STRIPE_WEBHOOK_SECRET is not configured.');
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      this.logger.error(`Stripe webhook rejected: signature did not verify — ${error instanceof Error ? error.message : error}`);
      return;
    }

    switch (event.type) {
      case 'invoice.paid':
        await this.onInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.onInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.updated':
        this.logger.log(`Stripe subscription ${(event.data.object as Stripe.Subscription).id} updated — logged only, see this method's own doc comment.`);
        break;
      default:
        break;
    }
  }

  private async onInvoicePaid(stripeInvoice: Stripe.Invoice): Promise<void> {
    const invoice = await this.prisma.platformInvoice.findUnique({
      where: { stripeInvoiceId: stripeInvoice.id },
      include: { tenant: true },
    });
    if (!invoice) {
      this.logger.warn(`invoice.paid for unknown Stripe invoice ${stripeInvoice.id}`);
      return;
    }

    await this.prisma.platformInvoice.update({
      where: { id: invoice.id },
      data: { stripePaymentStatus: 'PAID' },
    });

    // Reverses exactly the suspension `onInvoicePaymentFailed` below applied
    // — never a blanket reactivate of a tenant suspended for another reason.
    if (invoice.tenant.status === 'SUSPENDED' && invoice.tenant.suspendedReason?.startsWith('Stripe payment failed')) {
      await this.tenants.reactivate(invoice.tenant.id);
    }
  }

  private async onInvoicePaymentFailed(stripeInvoice: Stripe.Invoice): Promise<void> {
    const invoice = await this.prisma.platformInvoice.findUnique({
      where: { stripeInvoiceId: stripeInvoice.id },
      include: { tenant: true },
    });
    if (!invoice) {
      this.logger.warn(`invoice.payment_failed for unknown Stripe invoice ${stripeInvoice.id}`);
      return;
    }

    await this.prisma.platformInvoice.update({
      where: { id: invoice.id },
      data: { stripePaymentStatus: 'FAILED', stripePaymentFailedAt: new Date() },
    });

    // Doc 14's own "surfaced in the client's dashboard, not enforced by
    // killing their app" — TenantsService.suspend() is a status flip, the
    // tenant's own isolated deployment keeps running.
    if (invoice.tenant.status === 'ACTIVE') {
      await this.tenants.suspend(invoice.tenant.id, `Stripe payment failed for invoice ${invoice.id}`);
    }
  }
}

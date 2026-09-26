import { Controller, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AgencyStripeService } from './agency-stripe.service';

/**
 * Stripe posts here for this control plane's OWN Stripe account
 * (`invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`
 * — doc 14 WO-14.4). No `@UseGuards` — this app has no global session
 * guard (unlike apps/api's `JwtAuthGuard`), and authenticity here comes
 * from Stripe's own signature over the raw body
 * (`AgencyStripeService.handleWebhookEvent`), never a bearer credential —
 * same reasoning as `identity-verification.controller.ts`'s own nID
 * webhook on the tenant side. Reads `req.rawBody` (`main.ts`'s
 * `rawBody: true`) because the signature is over the exact bytes Stripe
 * sent, not the parsed JSON body.
 */
@Controller('agency/stripe')
export class AgencyStripeWebhookController {
  constructor(private readonly stripeAgency: AgencyStripeService) {}

  @Post('webhook')
  async webhook(@Req() req: RawBodyRequest<Request>): Promise<{ received: true }> {
    const signatureHeader = req.headers['stripe-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : (signatureHeader ?? '');
    await this.stripeAgency.handleWebhookEvent(req.rawBody ?? Buffer.alloc(0), signature);
    return { received: true };
  }
}

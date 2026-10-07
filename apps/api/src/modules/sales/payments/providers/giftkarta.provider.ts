import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../../core/config/app-config.service';
import type { PaymentCallbackResult, PaymentContext, PaymentInitiation, PaymentProvider } from '../payment-provider';

interface GiftkartaBalanceResponse {
  valid: boolean;
  balance: number;
  currency: string;
}

interface GiftkartaRedeemResponse {
  success: boolean;
  transactionId: string;
  remainingBalance: number;
  message?: string;
}

/**
 * Giftkarta — a third-party gift-card network the customer can redeem at
 * checkout, distinct from the shop's own gift cards (`giftcards` module,
 * which the shop issues and owns the ledger for). Giftkarta owns the card
 * and the balance; this shop only ever asks it to validate and redeem.
 *
 * HONESTY NOTE, unlike JazzCashProvider/EasypaisaProvider/NidVerificationProvider
 * in this same directory tree: those are written against each partner's own
 * PUBLISHED API documentation. No verified Giftkarta API reference was
 * available when this was written — the endpoint paths, field names and auth
 * header below are a best-effort placeholder using the conventions almost
 * every stored-value/gift-card REST API shares (bearer API key, JSON body, a
 * balance-check and a redeem call, an idempotency key on the write). CONFIRM
 * every field name and path against Giftkarta's actual API reference (or ask
 * their integration team for a Postman collection) before this ever runs
 * against a real card — get one sandbox redemption working end to end first,
 * exactly like this codebase already asks for JazzCash/Easypaisa/nID.
 *
 * Two-phase by design, not one call: `initiate()` makes NO external call and
 * returns PENDING immediately — a real redemption is a non-reversible
 * external side effect with no local rollback, so it must never run inside
 * OrdersService.place()'s own order-creation transaction (the same reasoning
 * JazzCash/Easypaisa never call their gateway from initiate() either, only
 * ever prepare a redirect). The storefront collects the card's code on a
 * follow-up screen once the order (and its PENDING payment row) already
 * exist, and PaymentsService.redeemGiftCardCode() calls redeemCode() below
 * well outside any transaction — see requiresCode's own doc comment on
 * PaymentProvider.
 *
 * Stays off until `giftkarta` is added to PAYMENT_PROVIDERS and
 * GIFTKARTA_API_BASE_URL / GIFTKARTA_API_KEY are set.
 */
@Injectable()
export class GiftkartaProvider implements PaymentProvider {
  readonly key = 'giftkarta';
  readonly labelEn = 'Giftkarta gift card';
  readonly labelUr = 'گفٹ کارٹا گفٹ کارڈ';
  readonly descriptionEn = "Pay with a Giftkarta gift card. You'll enter the code on the next screen.";
  readonly descriptionUr = 'گفٹ کارٹا گفٹ کارڈ سے ادائیگی کریں۔ کوڈ اگلے صفحے پر درج کریں۔';
  readonly requiresCode = true;

  private readonly logger = new Logger(GiftkartaProvider.name);

  constructor(private readonly config: AppConfigService) {}

  async feeFor(): Promise<number> {
    return 0;
  }

  /**
   * No external call — nothing to redeem yet, the customer has not typed a
   * code. Just reserves the "how will this order be paid for" slot. The
   * reference is ours alone (Giftkarta never sees it until redeemCode's own
   * idempotency key) — `Payment.reference` is unique shop-wide, so it must
   * still be distinct per order the way every other provider's is.
   */
  async initiate(context: PaymentContext): Promise<PaymentInitiation> {
    this.requireConfig('GIFTKARTA_API_KEY');
    return { status: 'PENDING', reference: `GK-${context.orderNumber}`, redirectUrl: null };
  }

  /**
   * Validates and redeems the code the customer typed on the storefront's
   * follow-up screen, for the exact amount owed. Refuses a code covering
   * only part of `context.amount` — Giftkarta is a whole payment method
   * here, the same way COD or a bank transfer cover the full amount; a
   * customer wanting to split tender across it and something else uses the
   * shop's own gift card / store credit fields at the earlier checkout step
   * instead (WO-5, DECISIONS.md ADR-028), which are designed for partial
   * tender.
   */
  async redeemCode(context: PaymentContext, code: string): Promise<PaymentCallbackResult> {
    const baseUrl = this.requireConfig('GIFTKARTA_API_BASE_URL');
    const apiKey = this.requireConfig('GIFTKARTA_API_KEY');
    const trimmedCode = code.trim().toUpperCase();

    let balanceCheck: GiftkartaBalanceResponse;
    try {
      balanceCheck = await this.postJson<GiftkartaBalanceResponse>(`${baseUrl}/v1/gift-cards/balance`, apiKey, {
        code: trimmedCode,
      });
    } catch (error) {
      this.logger.error(`Giftkarta balance check failed for order ${context.orderNumber}: ${(error as Error).message}`);
      return {
        reference: context.orderId,
        status: 'FAILED',
        failureReason: 'Could not reach Giftkarta to check this card. Please try again.',
        raw: {},
      };
    }

    if (!balanceCheck.valid) {
      return { reference: context.orderId, status: 'FAILED', failureReason: 'That gift card code is not valid.', raw: { ...balanceCheck } };
    }
    if (balanceCheck.balance < context.amount) {
      return {
        reference: context.orderId,
        status: 'FAILED',
        failureReason: 'That gift card does not have enough balance to cover this order.',
        raw: { ...balanceCheck },
      };
    }

    try {
      // Idempotency key so a retried request (a flaky connection, the
      // customer double-clicking) can never redeem the same order twice —
      // Giftkarta's own dedup, keyed on our order number rather than a
      // client-generated id, so two attempts for the SAME order always
      // collide server-side regardless of which of our requests reaches it.
      const redemption = await this.postJson<GiftkartaRedeemResponse>(`${baseUrl}/v1/gift-cards/redeem`, apiKey, {
        code: trimmedCode,
        amount: context.amount,
        idempotencyKey: `order:${context.orderNumber}`,
      });

      if (!redemption.success) {
        return {
          reference: context.orderId,
          status: 'FAILED',
          failureReason: redemption.message ?? 'That gift card could not be redeemed.',
          raw: { ...redemption },
        };
      }

      return {
        reference: context.orderId,
        status: 'PAID',
        providerRef: redemption.transactionId,
        raw: { ...redemption },
      };
    } catch (error) {
      this.logger.error(`Giftkarta redemption failed for order ${context.orderNumber}: ${(error as Error).message}`);
      return {
        reference: context.orderId,
        status: 'FAILED',
        failureReason: 'Could not complete the gift card redemption. Please try again.',
        raw: {},
      };
    }
  }

  private async postJson<T>(url: string, apiKey: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Giftkarta request to ${url} failed with ${response.status}: ${detail}`);
    }

    return (await response.json()) as T;
  }

  private requireConfig(key: 'GIFTKARTA_API_BASE_URL' | 'GIFTKARTA_API_KEY'): string {
    const value = this.config.get(key);
    if (!value) {
      throw new Error(`Giftkarta is enabled but ${key} is not set.`);
    }
    return value;
  }
}

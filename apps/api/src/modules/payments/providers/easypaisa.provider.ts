import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../core/config/app-config.service';
import { toMajor } from '@newax/shared';
import type {
  PaymentCallbackResult,
  PaymentContext,
  PaymentInitiation,
  PaymentProvider,
} from '../payment-provider';

const SANDBOX_URL = 'https://easypaystg.easypaisa.com.pk/easypay/Index.jsf';
const LIVE_URL = 'https://easypay.easypaisa.com.pk/easypay/Index.jsf';

/**
 * Easypaisa hosted checkout.
 *
 * Written against Easypaisa's documented redirect flow: the merchant posts the
 * customer to the Easypay portal with the store id, amount and return URL, and
 * the portal returns them with a status.
 *
 * Like JazzCash, this stays OFF until `easypaisa` is in PAYMENT_PROVIDERS and
 * the store credentials are set, and it has not been exercised against a live
 * merchant account — run one sandbox transaction before switching it on.
 */
@Injectable()
export class EasypaisaProvider implements PaymentProvider {
  readonly key = 'easypaisa';
  readonly labelEn = 'Easypaisa';
  readonly labelUr = 'ایزی پیسہ';
  readonly descriptionEn = 'Pay from your Easypaisa mobile account.';
  readonly descriptionUr = 'اپنے ایزی پیسہ موبائل اکاؤنٹ سے ادائیگی کریں۔';

  private readonly logger = new Logger(EasypaisaProvider.name);

  constructor(private readonly config: AppConfigService) {}

  async feeFor(): Promise<number> {
    return 0;
  }

  async initiate(context: PaymentContext): Promise<PaymentInitiation> {
    const storeId = this.config.get('EASYPAISA_STORE_ID');
    if (!storeId) {
      throw new Error('Easypaisa is enabled but EASYPAISA_STORE_ID is not set.');
    }

    const reference = `EP-${context.orderNumber}`;
    const expiry = new Date(Date.now() + 3_600_000);

    const fields: Record<string, string> = {
      storeId,
      // Easypaisa takes rupees with two decimals, not paisa.
      amount: toMajor(context.amount).toFixed(2),
      postBackURL: this.config.get('EASYPAISA_RETURN_URL') ?? '',
      orderRefNum: reference,
      expiryDate: `${expiry.getFullYear()}${pad(expiry.getMonth() + 1)}${pad(expiry.getDate())} ${pad(expiry.getHours())}${pad(expiry.getMinutes())}${pad(expiry.getSeconds())}`,
      merchantHashedReq: '',
      autoRedirect: '1',
      paymentMethod: 'MA_PAYMENT_METHOD',
      emailAddr: context.customerEmail ?? '',
      mobileNum: context.customerPhone ?? '',
    };

    const hashKey = this.config.get('EASYPAISA_HASH_KEY');
    if (hashKey) {
      fields.merchantHashedReq = createHash('sha256')
        .update(`${storeId}${fields.amount}${fields.orderRefNum}${hashKey}`)
        .digest('base64');
    }

    return {
      status: 'PENDING',
      reference,
      redirectUrl: this.config.get('EASYPAISA_SANDBOX') ? SANDBOX_URL : LIVE_URL,
      meta: { method: 'POST', fields },
    };
  }

  /**
   * Settles a payment ONLY when the response carries a hash that verifies
   * against EASYPAISA_HASH_KEY.
   *
   * This endpoint is public and unauthenticated — it has to be, the gateway
   * posts the customer back to it — so `status` in the body is attacker
   * controlled. It used to be trusted outright, which meant anyone could
   * POST {orderRefNumber, status: 'PAID'} and confirm an order without
   * paying for it.
   *
   * It fails CLOSED: no hash key configured, no hash in the response, or a
   * hash that does not match all return FAILED rather than PAID. The cost of
   * being wrong that way is a payment a staff member has to confirm by hand;
   * the cost of being wrong the other way is giving the goods away.
   *
   * NOTE: Easypaisa's response signing differs between integrations, and this
   * has not been run against a live merchant account. Confirm the field list
   * and ordering below against the integration guide, with one sandbox
   * transaction, before putting `easypaisa` in PAYMENT_PROVIDERS.
   */
  async handleCallback(payload: Record<string, unknown>): Promise<PaymentCallbackResult> {
    const reference = String(payload.orderRefNumber ?? payload.orderRefNum ?? '');
    const status = String(payload.status ?? '').toUpperCase();
    const code = String(payload.responseCode ?? '');

    const verification = this.verify(payload, reference);
    if (!verification.ok) {
      this.logger.error(`Easypaisa callback for ${reference} rejected: ${verification.reason}`);
      return {
        reference,
        status: 'FAILED',
        failureReason: 'Payment response failed verification.',
        verified: false,
        raw: Object.fromEntries(
          Object.entries(payload).map(([key, value]) => [key, String(value ?? '')]),
        ),
      };
    }

    const succeeded = status === 'PAID' || code === '0000';

    if (!succeeded) {
      this.logger.warn(`Easypaisa reported ${status || code} for ${reference}`);
    }

    return {
      reference,
      status: succeeded ? 'PAID' : 'FAILED',
      providerRef: String(payload.transactionId ?? '') || undefined,
      failureReason: succeeded ? undefined : String(payload.responseDesc ?? status ?? code),
      raw: Object.fromEntries(
        Object.entries(payload).map(([key, value]) => [key, String(value ?? '')]),
      ),
    };
  }
  /**
   * Recomputes the response hash and compares it in constant time.
   *
   * Mirrors the request-side scheme in initiate(): sha256 over the store id,
   * the significant response values and the shared key. Any absent piece is
   * a rejection, never a pass.
   */
  private verify(
    payload: Record<string, unknown>,
    reference: string,
  ): { ok: true } | { ok: false; reason: string } {
    const hashKey = this.config.get('EASYPAISA_HASH_KEY');
    if (!hashKey) {
      return { ok: false, reason: 'EASYPAISA_HASH_KEY is not configured' };
    }

    const storeId = this.config.get('EASYPAISA_STORE_ID');
    if (!storeId) {
      return { ok: false, reason: 'EASYPAISA_STORE_ID is not configured' };
    }

    const received = String(
      payload.merchantHashedResp ?? payload.merchantHashedResponse ?? payload.hashResponse ?? '',
    );
    if (!received) {
      return { ok: false, reason: 'response carried no hash' };
    }

    const expected = createHash('sha256')
      .update(
        `${storeId}${String(payload.status ?? '')}${reference}${String(
          payload.transactionId ?? '',
        )}${hashKey}`,
      )
      .digest('base64');

    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: 'hash mismatch' };
    }

    return { ok: true };
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

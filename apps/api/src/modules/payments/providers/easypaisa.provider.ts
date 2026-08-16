import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../core/config/app-config.service';
import { toMajor } from '@yaseen/shared';
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

  async handleCallback(payload: Record<string, unknown>): Promise<PaymentCallbackResult> {
    const reference = String(payload.orderRefNumber ?? payload.orderRefNum ?? '');
    const status = String(payload.status ?? '').toUpperCase();
    const code = String(payload.responseCode ?? '');

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
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

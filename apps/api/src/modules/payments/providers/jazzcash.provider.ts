import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../core/config/app-config.service';
import type {
  PaymentCallbackResult,
  PaymentContext,
  PaymentInitiation,
  PaymentProvider,
} from '../payment-provider';

const SANDBOX_URL =
  'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform';
const LIVE_URL =
  'https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform';

/**
 * JazzCash hosted checkout.
 *
 * Written against JazzCash's documented HTTP form post: the merchant builds a
 * parameter set, signs it with an HMAC-SHA256 over the values sorted by key and
 * prefixed with the integrity salt, and posts the customer to the portal, which
 * returns them to pp_ReturnURL with a signed response.
 *
 * This provider stays OFF until `jazzcash` is added to PAYMENT_PROVIDERS and
 * the merchant credentials are set — the store runs on COD and bank transfer
 * until then. Nothing here has been exercised against a live merchant account,
 * so verify one sandbox transaction end to end before switching it on.
 */
@Injectable()
export class JazzCashProvider implements PaymentProvider {
  readonly key = 'jazzcash';
  readonly labelEn = 'JazzCash';
  readonly labelUr = 'جاز کیش';
  readonly descriptionEn = 'Pay from your JazzCash mobile account.';
  readonly descriptionUr = 'اپنے جاز کیش موبائل اکاؤنٹ سے ادائیگی کریں۔';

  private readonly logger = new Logger(JazzCashProvider.name);

  constructor(private readonly config: AppConfigService) {}

  async feeFor(): Promise<number> {
    return 0;
  }

  async initiate(context: PaymentContext): Promise<PaymentInitiation> {
    const merchantId = this.config.get('JAZZCASH_MERCHANT_ID');
    const password = this.config.get('JAZZCASH_PASSWORD');
    const salt = this.config.get('JAZZCASH_INTEGRITY_SALT');

    if (!merchantId || !password || !salt) {
      throw new Error(
        'JazzCash is enabled but JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD and JAZZCASH_INTEGRITY_SALT are not all set.',
      );
    }

    const now = new Date();
    const reference = `T${stamp(now)}${context.orderNumber.replace(/\D/g, '').slice(-6)}`;

    const fields: Record<string, string> = {
      pp_Version: '1.1',
      pp_TxnType: 'MWALLET',
      pp_Language: 'EN',
      pp_MerchantID: merchantId,
      pp_Password: password,
      pp_TxnRefNo: reference,
      // JazzCash expects the amount in paisa, which is how it is stored here.
      pp_Amount: String(context.amount),
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: stamp(now),
      // One hour to complete the payment.
      pp_TxnExpiryDateTime: stamp(new Date(now.getTime() + 3_600_000)),
      pp_BillReference: context.orderNumber,
      pp_Description: `Order ${context.orderNumber}`,
      pp_ReturnURL: this.config.get('JAZZCASH_RETURN_URL') ?? '',
      ppmpf_1: context.customerPhone ?? '',
    };

    fields.pp_SecureHash = this.sign(fields, salt);

    return {
      status: 'PENDING',
      reference,
      redirectUrl: this.config.get('JAZZCASH_SANDBOX') ? SANDBOX_URL : LIVE_URL,
      // The storefront posts these as a form to redirectUrl.
      meta: { method: 'POST', fields },
    };
  }

  async handleCallback(payload: Record<string, unknown>): Promise<PaymentCallbackResult> {
    const salt = this.config.get('JAZZCASH_INTEGRITY_SALT');
    const received = String(payload.pp_SecureHash ?? '');

    // Without the salt every hash below would be keyed on the empty string,
    // which anyone can reproduce — the verification would wave forgeries
    // through. initiate() already refuses to run unconfigured; so does this.
    if (!salt) {
      this.logger.error('JazzCash callback rejected: JAZZCASH_INTEGRITY_SALT is not configured.');
      return {
        reference: String(payload.pp_TxnRefNo ?? ''),
        status: 'FAILED',
        failureReason: 'Payment response failed verification.',
        verified: false,
        raw: {},
      };
    }

    const values = Object.fromEntries(
      Object.entries(payload)
        .filter(([key]) => key !== 'pp_SecureHash')
        .map(([key, value]) => [key, String(value ?? '')]),
    );

    const expected = this.sign(values, salt);
    const reference = String(payload.pp_TxnRefNo ?? '');

    // A response whose hash does not match did not come from JazzCash.
    // Compared in constant time so the endpoint cannot be used as an oracle
    // to discover a valid hash byte by byte.
    if (!received || !hashesMatch(received, expected)) {
      this.logger.error(`JazzCash callback for ${reference} failed hash verification`);
      return {
        reference,
        status: 'FAILED',
        failureReason: 'Payment response failed verification.',
        verified: false,
        raw: values,
      };
    }

    const code = String(payload.pp_ResponseCode ?? '');
    const succeeded = code === '000' || code === '121';

    return {
      reference,
      status: succeeded ? 'PAID' : 'FAILED',
      providerRef: String(payload.pp_RetreivalReferenceNo ?? '') || undefined,
      failureReason: succeeded ? undefined : String(payload.pp_ResponseMessage ?? code),
      raw: values,
    };
  }

  /** HMAC-SHA256 over the salt and the non-empty values, sorted by key. */
  private sign(fields: Record<string, string>, salt: string): string {
    const message = [
      salt,
      ...Object.keys(fields)
        .filter((key) => key.startsWith('pp_') || key.startsWith('ppmpf_'))
        .sort()
        .map((key) => fields[key])
        .filter((value) => value !== undefined && value !== ''),
    ].join('&');

    return createHmac('sha256', salt).update(message).digest('hex');
  }
}

/** JazzCash timestamps are yyyyMMddHHmmss. */
function stamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

/**
 * Constant-time hash comparison. Hex is case-insensitive, so both sides are
 * lowercased before the byte compare; a length difference is a mismatch.
 */
function hashesMatch(received: string, expected: string): boolean {
  const a = Buffer.from(received.toLowerCase());
  const b = Buffer.from(expected.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

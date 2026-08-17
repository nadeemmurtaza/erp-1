import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import type {
  PaymentContext,
  PaymentInitiation,
  PaymentProvider,
} from '../payment-provider';

interface BankAccount {
  bank: string;
  title: string;
  accountNumber: string;
  iban: string;
}

/**
 * Bank transfer: the customer pays into the shop's account and uploads the
 * receipt, and staff approve it from the dashboard.
 *
 * The order stays AWAITING_APPROVAL until then, so nothing is dispatched
 * against an unverified transfer.
 */
@Injectable()
export class BankTransferProvider implements PaymentProvider {
  readonly key = 'bank_transfer';
  readonly labelEn = 'Bank transfer';
  readonly labelUr = 'بینک ٹرانسفر';
  readonly descriptionEn =
    'Transfer to our account and upload the receipt. We dispatch once it is confirmed.';
  readonly descriptionUr =
    'ہمارے اکاؤنٹ میں رقم منتقل کریں اور رسید اپلوڈ کریں۔ تصدیق کے بعد پارسل روانہ کر دیا جائے گا۔';

  constructor(private readonly settings: SettingsService) {}

  async feeFor(): Promise<number> {
    return 0;
  }

  async initiate(context: PaymentContext): Promise<PaymentInitiation> {
    const accounts = await this.settings.get<BankAccount[]>(SettingKey.BankAccounts);

    return {
      status: 'AWAITING_APPROVAL',
      reference: `BT-${context.orderNumber}-${randomBytes(3).toString('hex').toUpperCase()}`,
      redirectUrl: null,
      // The storefront shows these on the confirmation page so the customer
      // knows where to send the money.
      meta: { accounts },
    };
  }
}

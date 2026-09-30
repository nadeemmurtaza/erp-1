import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../../../core/settings/settings.service';
import { SettingKey } from '../../../../core/settings/settings.defaults';
import type {
  PaymentContext,
  PaymentInitiation,
  PaymentProvider,
} from '../payment-provider';

/**
 * Cash on delivery — how most of Pakistan pays online.
 *
 * The order is placed unpaid and the courier collects. The collection fee comes
 * from settings rather than a constant, so staff can change it from the
 * dashboard as courier rates move.
 */
@Injectable()
export class CodProvider implements PaymentProvider {
  readonly key = 'cod';
  readonly labelEn = 'Cash on delivery';
  readonly labelUr = 'کیش آن ڈیلیوری';
  readonly descriptionEn = 'Pay the courier in cash when your parcel arrives.';
  readonly descriptionUr = 'پارسل موصول ہونے پر کورئیر کو نقد ادائیگی کریں۔';

  constructor(private readonly settings: SettingsService) {}

  async feeFor(): Promise<number> {
    return this.settings.get<number>(SettingKey.CodFee);
  }

  async initiate(context: PaymentContext): Promise<PaymentInitiation> {
    return {
      // Nothing is collected yet; staff mark it paid on delivery.
      status: 'PENDING',
      reference: `COD-${context.orderNumber}-${randomBytes(3).toString('hex').toUpperCase()}`,
      redirectUrl: null,
    };
  }
}

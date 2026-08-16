import { toMinor } from '@yaseen/shared';

/**
 * Business rules that staff must be able to change without a deploy: shipping
 * zones, the COD fee, stitching lead times. These are only the DEFAULTS, seeded
 * into the Setting table on first boot and editable in the dashboard afterwards.
 *
 * Adding a setting: add it here with a sane default and read it through
 * SettingsService.get(). Never read a business rule from a constant.
 */

export interface ShippingZone {
  key: string;
  labelEn: string;
  labelUr: string;
  /** Cities matched case-insensitively; the catch-all zone has an empty list. */
  cities: string[];
  fee: number;
  freeAbove: number;
  etaDays: [number, number];
}

export interface StoreSettings {
  nameEn: string;
  nameUr: string;
  supportPhone: string;
  supportEmail: string;
  whatsapp: string;
}

export const SettingKey = {
  Store: 'store',
  ShippingZones: 'shipping.zones',
  CodFee: 'checkout.cod_fee',
  CodEnabled: 'checkout.cod_enabled',
  MinOrderValue: 'checkout.min_order_value',
  StitchingLeadDays: 'stitching.lead_days',
  BankAccounts: 'payments.bank_accounts',
  LowStockThreshold: 'catalog.low_stock_threshold',
} as const;

export type SettingKeyName = (typeof SettingKey)[keyof typeof SettingKey];

export const DEFAULT_SETTINGS: Record<SettingKeyName, unknown> = {
  [SettingKey.Store]: {
    nameEn: 'Yaseen',
    nameUr: 'یٰسین',
    supportPhone: '+923001234567',
    supportEmail: 'support@yaseen.pk',
    whatsapp: '+923001234567',
  } satisfies StoreSettings,

  [SettingKey.ShippingZones]: [
    {
      key: 'karachi',
      labelEn: 'Karachi',
      labelUr: 'کراچی',
      cities: ['karachi'],
      fee: toMinor(150),
      freeAbove: toMinor(3000),
      etaDays: [1, 2],
    },
    {
      key: 'punjab',
      labelEn: 'Punjab & Islamabad',
      labelUr: 'پنجاب و اسلام آباد',
      cities: ['lahore', 'islamabad', 'rawalpindi', 'faisalabad', 'multan', 'gujranwala'],
      fee: toMinor(200),
      freeAbove: toMinor(4000),
      etaDays: [2, 4],
    },
    {
      key: 'rest_of_pakistan',
      labelEn: 'Rest of Pakistan',
      labelUr: 'باقی پاکستان',
      cities: [],
      fee: toMinor(250),
      freeAbove: toMinor(5000),
      etaDays: [3, 6],
    },
  ] satisfies ShippingZone[],

  /** Charged on top when the customer pays cash on delivery. */
  [SettingKey.CodFee]: toMinor(100),
  [SettingKey.CodEnabled]: true,
  [SettingKey.MinOrderValue]: toMinor(500),

  /** Working days from order to a stitched garment being ready. */
  [SettingKey.StitchingLeadDays]: 7,

  [SettingKey.BankAccounts]: [
    {
      bank: 'Meezan Bank',
      title: 'Yaseen Clothing',
      accountNumber: '00000000000000',
      iban: 'PK00MEZN0000000000000000',
    },
  ],

  [SettingKey.LowStockThreshold]: 3,
};

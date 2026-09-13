import { BRAND, toMinor } from '@newax/shared';

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
  /** IANA zone the shop trades in. Decides where a calendar day begins. */
  StoreTimezone: 'store.timezone',
  ShippingZones: 'shipping.zones',
  CodFee: 'checkout.cod_fee',
  CodEnabled: 'checkout.cod_enabled',
  MinOrderValue: 'checkout.min_order_value',
  StitchingLeadDays: 'stitching.lead_days',
  BankAccounts: 'payments.bank_accounts',
  LowStockThreshold: 'catalog.low_stock_threshold',
  MonthlyRevenueTarget: 'analytics.monthly_revenue_target',
  PurchasingOverReceiptTolerance: 'purchasing.over_receipt_tolerance',
  PurchasingAutoDraftReorder: 'purchasing.auto_draft_reorder',
  InventorySlowMoverDays: 'inventory.slow_mover_days',
  InventoryDeadStockDays: 'inventory.dead_stock_days',
  /** Off until an owner turns it on — every order's tax is zero either way. */
  TaxEnabled: 'tax.enabled',
  /** 'INCLUSIVE' (unitPrice already contains tax) or 'EXCLUSIVE' (tax is added at checkout). */
  TaxPricingMode: 'tax.pricing_mode',
  /** TaxClass.key used for a variant with no taxClassId of its own. */
  TaxDefaultClass: 'tax.default_class',
  /**
   * Off until an owner turns it on — MarketingAutomationCron no-ops entirely
   * while this is false, the ship-safe default for anything that emails a
   * customer without them clicking a button first.
   */
  MarketingAutomationEnabled: 'marketing.automation_enabled',
  /** Cart idle time before the first abandoned-cart email. Logged-in users only — see MarketingAutomationCron. */
  MarketingAbandonedCartReminderHours: 'marketing.abandoned_cart_reminder_hours',
  /** Idle time AFTER the reminder before the incentive follow-up, if the cart is still not converted. */
  MarketingAbandonedCartIncentiveHours: 'marketing.abandoned_cart_incentive_hours',
  /** Days after DELIVERED before the review-request email. */
  MarketingReviewRequestDays: 'marketing.review_request_days',
  /** Days after DELIVERED before a Product.isConsumable purchase gets a reorder nudge. One global cadence, not per-product. */
  MarketingReplenishmentReminderDays: 'marketing.replenishment_reminder_days',
} as const;

export type SettingKeyName = (typeof SettingKey)[keyof typeof SettingKey];

export const DEFAULT_SETTINGS: Record<SettingKeyName, unknown> = {
  /*
   * Seeded from the brand file, not typed out again. These were a second
   * copy of facts BRAND already held, and the two had drifted: the support
   * phone here was +923001234567 while the brand file said +92 335 621 2709,
   * and nothing reconciled them because nobody reads both files at once.
   */
  [SettingKey.Store]: {
    nameEn: BRAND.identity.name,
    nameUr: BRAND.identity.nameUr,
    supportPhone: BRAND.contact.phone,
    supportEmail: BRAND.contact.email,
    whatsapp: BRAND.contact.whatsapp,
  } satisfies StoreSettings,

  /**
   * Every "today", every daily revenue bucket and every date on an export is
   * resolved in this zone — not the server's and not UTC. A shop that moves
   * country changes this row rather than a deployment.
   */
  [SettingKey.StoreTimezone]: BRAND.locale.timeZone,

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

  /* Same fork as the store block: the account title here said "Yaseen
   * Clothing" where the brand file said "Yaseen Fabrics". */
  [SettingKey.BankAccounts]: [
    {
      bank: BRAND.banking.bankName,
      title: BRAND.banking.accountTitle,
      accountNumber: BRAND.banking.accountNumber,
      iban: BRAND.banking.iban,
    },
  ],

  [SettingKey.LowStockThreshold]: 3,

  /** Shown as the dashboard's monthly progress target until an admin sets a real one. */
  [SettingKey.MonthlyRevenueTarget]: toMinor(1_000_000),

  [SettingKey.PurchasingOverReceiptTolerance]: 0,
  [SettingKey.PurchasingAutoDraftReorder]: true,

  [SettingKey.InventorySlowMoverDays]: 60,
  [SettingKey.InventoryDeadStockDays]: 180,

  [SettingKey.TaxEnabled]: false,
  [SettingKey.TaxPricingMode]: 'EXCLUSIVE',
  [SettingKey.TaxDefaultClass]: 'standard',

  [SettingKey.MarketingAutomationEnabled]: false,
  [SettingKey.MarketingAbandonedCartReminderHours]: 24,
  [SettingKey.MarketingAbandonedCartIncentiveHours]: 72,
  [SettingKey.MarketingReviewRequestDays]: 7,
  [SettingKey.MarketingReplenishmentReminderDays]: 30,
};

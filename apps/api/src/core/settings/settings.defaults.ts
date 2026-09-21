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

/** Which artwork a receipt, invoice or email shows at the top. */
export type DocumentLogoSource = 'text' | 'site' | 'custom';

/** What each kind of document's numbers start with. */
export interface DocumentPrefixes {
  order: string;
  purchaseOrder: string;
  goodsReceipt: string;
  stitchingOrder: string;
  stitchingJob: string;
  stockCount: string;
  /** A legal sequence, not node-prefixed the way the rest are (R18/R6) — see accounting.service.ts. */
  journalEntry: string;
  /** Trading-partner document (WO-18.3+) — R6-style numbering, not R18's fiscal-year legal sequence. */
  invoice: string;
  quote: string;
  /** Inter-branch stock transfer (WO-22.1, R4/R6) — node-prefixed like the rest. */
  stockTransfer: string;
  /** R12/R17's inter-brand settlement document (WO-22.3) — node-prefixed like the rest, and distinct from `invoice` above (a different document). */
  interBranchInvoice: string;
}

export interface DocumentSettings {
  logoSource: DocumentLogoSource;
  /** Only read when logoSource is 'custom'. */
  logoUrl: string | null;
  prefixes: DocumentPrefixes;
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
  /**
   * Convert every uploaded image to WebP before storing it.
   *
   * On by default: WebP is smaller than JPEG or PNG at the same visual
   * quality, and "serve images in next-gen formats" is a Lighthouse check
   * that feeds page-speed SEO. Turn it off only when an original must be
   * kept byte-for-byte — a print supplier who needs the source file, say.
   * Images already stored stay as they were; this decides new uploads.
   */
  MediaWebpEnabled: 'media.webp_enabled',
  /**
   * What a customer-facing document shows at the top, and what the numbers on
   * it start with.
   *
   * Prefixes are a Setting rather than a constant because a shop that already
   * numbers its paperwork a particular way should not have to match ours —
   * and because the brand file's default is the client's initials, which the
   * next client will want changed. Changing a prefix affects new documents
   * only; anything already issued keeps the number it was given.
   */
  Documents: 'documents',
  MonthlyRevenueTarget: 'analytics.monthly_revenue_target',
  PurchasingOverReceiptTolerance: 'purchasing.over_receipt_tolerance',
  PurchasingAutoDraftReorder: 'purchasing.auto_draft_reorder',
  /** Off until an owner turns it on — checkout keeps its "stock lands or none of it does" behavior by default. */
  OrdersAllowBackorder: 'checkout.allow_backorder',
  InventorySlowMoverDays: 'inventory.slow_mover_days',
  InventoryDeadStockDays: 'inventory.dead_stock_days',
  /** How many days out a projected stockout has to be before the supplier stock/velocity digest flags a variant as "action required". */
  PurchasingSupplierDigestLeadDays: 'purchasing.supplier_digest_lead_days',
  /** OTIF percentage below which the weekly supplier scorecard alerts procurement. */
  PurchasingSupplierScorecardOtifThreshold: 'purchasing.supplier_scorecard_otif_threshold',
  /** Projected days-of-cover (current stock + everything already in flight) below which the weekly demand alert fires for a variant whose sales velocity is rising. */
  InventoryDemandSurgeHorizonDays: 'inventory.demand_surge_horizon_days',
  /** Off until an owner turns it on — every order's tax is zero either way. */
  TaxEnabled: 'tax.enabled',
  /** 'INCLUSIVE' (unitPrice already contains tax) or 'EXCLUSIVE' (tax is added at checkout). */
  TaxPricingMode: 'tax.pricing_mode',
  /** TaxClass.key used for a variant with no taxClassId of its own. */
  TaxDefaultClass: 'tax.default_class',
  /** ISO 4217 — pre-fills a new expense's currency field. */
  FinanceDefaultCurrency: 'finance.default_currency',
  /** 0-23, server-local. Hour of day FinanceCron generates due recurring expense instances — adjustable without a deploy, same idiom as the other cron-gating settings below. */
  FinanceRecurringRunHour: 'finance.recurring_run_hour',
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

  [SettingKey.MediaWebpEnabled]: true,

  [SettingKey.Documents]: {
    /*
     * 'text' sets the shop's name as styled type, which is what most people
     * actually see: Gmail and Outlook block hosted images until the reader
     * clicks "show images", so a logo file is the version that frequently
     * does not arrive. 'site' uses the storefront's own artwork; 'custom'
     * uses one uploaded for documents alone — a shop whose web logo is
     * knocked out white needs a dark one on a white invoice.
     */
    logoSource: 'text',
    logoUrl: null,
    prefixes: {
      order: BRAND.commerce.orderNumberPrefix,
      purchaseOrder: 'PO',
      goodsReceipt: 'GRN',
      stitchingOrder: 'STO',
      stitchingJob: 'JOB',
      stockCount: 'SC',
      journalEntry: 'JE',
      invoice: 'INV',
      quote: 'QTE',
      stockTransfer: 'TRF',
      interBranchInvoice: 'IBI',
    },
  } satisfies DocumentSettings,

  /** Shown as the dashboard's monthly progress target until an admin sets a real one. */
  [SettingKey.MonthlyRevenueTarget]: toMinor(1_000_000),

  [SettingKey.PurchasingOverReceiptTolerance]: 0,
  [SettingKey.PurchasingAutoDraftReorder]: true,
  [SettingKey.OrdersAllowBackorder]: false,

  [SettingKey.InventorySlowMoverDays]: 60,
  [SettingKey.InventoryDeadStockDays]: 180,
  [SettingKey.PurchasingSupplierDigestLeadDays]: 3,
  [SettingKey.PurchasingSupplierScorecardOtifThreshold]: 85,
  [SettingKey.InventoryDemandSurgeHorizonDays]: 14,

  [SettingKey.TaxEnabled]: false,
  [SettingKey.TaxPricingMode]: 'EXCLUSIVE',
  [SettingKey.TaxDefaultClass]: 'standard',
  [SettingKey.FinanceDefaultCurrency]: 'PKR',
  [SettingKey.FinanceRecurringRunHour]: 3,

  [SettingKey.MarketingAutomationEnabled]: false,
  [SettingKey.MarketingAbandonedCartReminderHours]: 24,
  [SettingKey.MarketingAbandonedCartIncentiveHours]: 72,
  [SettingKey.MarketingReviewRequestDays]: 7,
  [SettingKey.MarketingReplenishmentReminderDays]: 30,
};

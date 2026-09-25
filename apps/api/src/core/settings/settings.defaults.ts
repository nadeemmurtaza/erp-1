import { BRAND, toMinor } from '@newax/shared';

/**
 * Business rules that staff must be able to change without a deploy: shipping
 * zones, the COD fee, stitching lead times. These are only the DEFAULTS, seeded
 * into the Setting table on first boot and editable in the dashboard afterwards.
 *
 * Adding a setting: add it here with a sane default and read it through
 * SettingsService.get(). Never read a business rule from a constant.
 */

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
  /** BomProductionRun (WO-C.3) — node-prefixed like the rest. */
  productionRun: string;
  /** PayRun (docs/implementation/payroll/19-payroll.md WO-19.4) — node-prefixed like the rest. */
  payRun: string;
  /** ReturnRequest (WO-6.6, 06-shipping-fulfilment-returns.md) — node-prefixed like the rest. */
  returnRequest: string;
  /** Manifest (WO-6.4) — node-prefixed like the rest. */
  manifest: string;
}

export interface DocumentSettings {
  logoSource: DocumentLogoSource;
  /** Only read when logoSource is 'custom'. */
  logoUrl: string | null;
  prefixes: DocumentPrefixes;
}

/**
 * Basis points per payment provider (Rule 5 — 250 = 2.5%), read by
 * OrderEconomicsService (WO-B.3) to derive `gatewayFee` from `Order.grandTotal`.
 * The index signature covers a provider PaymentProvider.key names that isn't
 * one of the two explicit keys below (jazzcash, easypaisa) — those fall back
 * to `default` until they carry their own real rate.
 */
export interface FinanceGatewayFeeBpsSettings {
  [provider: string]: number;
  cod: number;
  bank_transfer: number;
  default: number;
}

export const SettingKey = {
  Store: 'store',
  /** IANA zone the shop trades in. Decides where a calendar day begins. */
  StoreTimezone: 'store.timezone',
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
  /** Flat per-order packaging cost, paisa (WO-B.3) — every order costs the same to box, whatever it contains. */
  FinancePackagingCostPerOrder: 'finance.packaging_cost_per_order',
  /** See FinanceGatewayFeeBpsSettings above. */
  FinanceGatewayFeeBps: 'finance.gateway_fee_bps',
  /** 1-28, server-local. Day of month LeaveAccrualCron credits every active LeaveBalance — 28 so it never skips a short February. */
  PayrollAccrualRunDay: 'payroll.accrual_run_day',
  /** 0-23, server-local. Hour of day LeaveAccrualCron runs on its configured day — same idiom as FinanceRecurringRunHour. */
  PayrollAccrualRunHour: 'payroll.accrual_run_hour',
  /**
   * Off until an owner turns it on — MarketingAutomationCron no-ops entirely
   * while this is false, the ship-safe default for anything that emails a
   * customer without them clicking a button first.
   */
  MarketingAutomationEnabled: 'marketing.automation_enabled',
  /** WO-8.5's own first stage of the doc's 1h/24h/72h sequence — a soft nudge, no incentive. */
  MarketingAbandonedCartFirstTouchHours: 'marketing.abandoned_cart_first_touch_hours',
  /** Cart idle time before the first abandoned-cart email. Logged-in users only — see MarketingAutomationCron. */
  MarketingAbandonedCartReminderHours: 'marketing.abandoned_cart_reminder_hours',
  /** Idle time AFTER the reminder before the incentive follow-up, if the cart is still not converted. */
  MarketingAbandonedCartIncentiveHours: 'marketing.abandoned_cart_incentive_hours',
  /** Basis points off the recovery PromoCode minted for the incentive stage (WO-8.5). 1000 = 10%. */
  MarketingAbandonedCartDiscountBps: 'marketing.abandoned_cart_discount_bps',
  /** Cap on that discount, in paisa. Null = uncapped. */
  MarketingAbandonedCartDiscountMaxOff: 'marketing.abandoned_cart_discount_max_off',
  /** How long the minted code stays redeemable. */
  MarketingAbandonedCartDiscountValidDays: 'marketing.abandoned_cart_discount_valid_days',
  /**
   * Internal bookkeeping: the id of the system Discount MarketingAutomationCron
   * lazily creates once and reuses. Deliberately not exposed in
   * UpdateMarketingSettingsDto — an owner edits the discount itself (rate, cap)
   * from Marketing → Discounts, this is just how the cron finds it again.
   */
  MarketingAbandonedCartDiscountId: 'marketing.abandoned_cart_discount_id',
  /** Days after DELIVERED before the review-request email. */
  MarketingReviewRequestDays: 'marketing.review_request_days',
  /** Days after DELIVERED before a Product.isConsumable purchase gets a reorder nudge. One global cadence, not per-product. */
  MarketingReplenishmentReminderDays: 'marketing.replenishment_reminder_days',
  /** WO-8.4 — CampaignDispatchCron's own throttle, so a large segment cannot blow through a provider's per-minute rate limit in one tick. */
  MarketingCampaignSendRatePerMinute: 'marketing.campaign_send_rate_per_minute',
  /** Category.slug every RawMaterial's underlying Product is filed under (WO-C.1). Seeded at boot by seedRawMaterialCategory(); resolved at runtime, never hardcoded. */
  BomRawMaterialCategorySlug: 'bom.raw_material_category_slug',
  /** Basis points of expected wastage assumed on a recipe with no line-level override (WO-C.2). 0 until a recipe says otherwise. */
  BomDefaultWastageBps: 'bom.default_wastage_bps',
  /** `{CAT}`/`{PRODUCT}`/`{OPT}`/`{SEQ}` template read by packages/shared's generateSku() (WO-3.3). */
  CatalogSkuTemplate: 'catalog.sku_template',
  /**
   * WO-3.2's cutover switch (03-variants-sku-seo.md), replacing the doc's own
   * "soak for a week of real traffic" gate — this repo's own deployment has
   * no live traffic to ever soak with (CLAUDE.md's Deployment section), so a
   * wall-clock timer could never fire. Every variant write already
   * dual-writes ProductOption/ProductOptionValue alongside size/color
   * (additive, always on); this flag is the human decision that the option
   * model is trustworthy enough to read from. False until an owner flips it
   * — reads keep coming from size/color/colorHex exactly as before either way.
   */
  CatalogUseOptionModelReads: 'catalog.use_option_model_reads',
  /** Only a verified purchaser may leave a review, off means anyone signed in may (WO-7.5). */
  ReviewsVerifiedPurchaseOnly: 'reviews.verified_purchase_only',
  /** Loyalty earn rate on DELIVERED, as basis points of rupees spent (WO-7.7) — 100 bps = 1% = 1 point per Rs. 100. */
  LoyaltyPointsPerRupeeBps: 'loyalty.points_per_rupee_bps',
  /** How many points one rupee of store credit costs on redemption (WO-7.7) — e.g. 10 means 10 points = Rs. 1. */
  LoyaltyRedemptionPointsPerRupee: 'loyalty.redemption_points_per_rupee',
  /** Store credit, in paisa, both sides of a referral receive once the referee's first order is DELIVERED (WO-7.7). */
  LoyaltyReferralRewardAmount: 'loyalty.referral_reward_amount',
  /**
   * Phase 9 (09-ai-layer.md) — "add a monthly budget setting and stop
   * calling when it is hit". Null means uncapped, same idiom as
   * MarketingAbandonedCartDiscountMaxOff above. Paisa, so it compares
   * directly against AiUsageLog.costPaisa's own running sum for the current
   * shop month (AiService.underBudget()).
   */
  AiMonthlyBudgetPaisa: 'ai.monthly_budget_paisa',
  /**
   * Every provider bills in USD; every other money figure in this codebase
   * is paisa. An approximation for budget alerting, not an invoice
   * reconciliation tool — see ai.service.ts's own PRICING table comment.
   * Editable without a deploy because the real rate moves.
   */
  AiUsdToPkrRate: 'ai.usd_to_pkr_rate',

  /**
   * WO-9.2 (09-ai-layer.md) — "a garment where 40% say too small gets its
   * recommendation shifted up a size." Below this share for both too-small
   * and too-large, ProductSizeBias.shift stays 0 (arithmetic match only).
   */
  SizeBiasShiftThresholdPct: 'measurements.size_bias_shift_threshold_pct',
  /**
   * Minimum combined review + return-reason sample before a shift is ever
   * applied — two disappointed customers should not move a recommendation.
   */
  SizeBiasMinSampleSize: 'measurements.size_bias_min_sample_size',
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
      productionRun: 'PR',
      payRun: 'PAY',
      returnRequest: 'RMA',
      manifest: 'MFT',
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
  [SettingKey.FinancePackagingCostPerOrder]: toMinor(50),
  [SettingKey.FinanceGatewayFeeBps]: {
    cod: 0,
    bank_transfer: 0,
    default: 250,
  } satisfies FinanceGatewayFeeBpsSettings,
  [SettingKey.PayrollAccrualRunDay]: 1,
  [SettingKey.PayrollAccrualRunHour]: 4,

  [SettingKey.MarketingAutomationEnabled]: false,
  [SettingKey.MarketingAbandonedCartFirstTouchHours]: 1,
  [SettingKey.MarketingAbandonedCartReminderHours]: 24,
  [SettingKey.MarketingAbandonedCartIncentiveHours]: 72,
  [SettingKey.MarketingAbandonedCartDiscountBps]: 1000,
  [SettingKey.MarketingAbandonedCartDiscountMaxOff]: null as number | null,
  [SettingKey.MarketingAbandonedCartDiscountValidDays]: 7,
  [SettingKey.MarketingAbandonedCartDiscountId]: null as string | null,
  [SettingKey.MarketingReviewRequestDays]: 7,
  [SettingKey.MarketingReplenishmentReminderDays]: 30,
  [SettingKey.MarketingCampaignSendRatePerMinute]: 60,

  [SettingKey.ReviewsVerifiedPurchaseOnly]: true,
  /** 100 bps = 1% = 1 point earned per Rs. 100 spent. */
  [SettingKey.LoyaltyPointsPerRupeeBps]: 100,
  [SettingKey.LoyaltyRedemptionPointsPerRupee]: 10,
  [SettingKey.LoyaltyReferralRewardAmount]: toMinor(200),

  [SettingKey.AiMonthlyBudgetPaisa]: null as number | null,
  [SettingKey.AiUsdToPkrRate]: 280,

  [SettingKey.SizeBiasShiftThresholdPct]: 40,
  [SettingKey.SizeBiasMinSampleSize]: 5,

  [SettingKey.BomRawMaterialCategorySlug]: 'raw-materials',
  [SettingKey.BomDefaultWastageBps]: 0,

  [SettingKey.CatalogSkuTemplate]: '{CAT}-{PRODUCT}-{OPT}-{SEQ}',
  [SettingKey.CatalogUseOptionModelReads]: false,
};

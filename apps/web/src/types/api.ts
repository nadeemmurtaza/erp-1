import type {
  ApiKeySurface,
  Locale,
  PermissionKey,
  ProductKind,
  ProductStatus,
  StitchingStage,
} from '@newax/shared';

/** Shapes returned by the API. Mirrors apps/api's response objects. */

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface ProductImage {
  url: string;
  alt: string | null;
  isPrimary: boolean;
}

export interface ProductVariant {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  colorHex: string | null;
  /** Paisa. */
  price: number;
  stock: number;
  inStock: boolean;
}

/** A product already flattened into one locale by the API. */
export interface StorefrontProduct {
  id: string;
  slug: string;
  kind: ProductKind;
  name: string;
  description: string | null;
  careInstructions: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  brand: string | null;
  fabric: string | null;
  season: string | null;
  tags: string[];
  pieceCount: number | null;
  fabricMeters: number | null;
  stitchingAvailable: boolean;
  images: ProductImage[];
  metaTitle: string | null;
  metaDescription: string | null;
  noindex: boolean;
  canonicalOverride: string | null;
  variants: ProductVariant[];
  category: { id: string; slug: string; name: string } | null;
  /** UNSTITCHED only: the garments this fabric can be made into. */
  garmentTypes: Array<{ id: string; key: string; label: string; baseFabricGaz: number | null }>;
  /** STITCHING_SERVICE only: the garment this service stitches. */
  serviceGarment: { id: string; key: string; label: string } | null;
  inStock: boolean;
  fromPrice: number;
  /** Phase 7 WO-7.5 — populated on the product detail fetch only. */
  reviewCount: number | null;
  averageRating: number | null;
}

export interface CategoryNode {
  id: string;
  slug: string;
  parentId: string | null;
  imageUrl: string | null;
  name: string;
  description: string | null;
  children: CategoryNode[];
}

export interface CatalogFacets {
  fabrics: string[];
  seasons: string[];
  pieceCounts: number[];
  priceRange: { min: number; max: number };
}

export interface ProductListQuery {
  locale?: Locale;
  page?: number;
  pageSize?: number;
  q?: string;
  category?: string;
  kind?: ProductKind;
  fabric?: string[];
  season?: string[];
  pieceCount?: string[];
  minPrice?: number;
  maxPrice?: number;
  sort?: 'featured' | 'newest' | 'price_asc' | 'price_desc' | 'name';
  /** WO-9.5 — product slugs already ranked by a /search/by-image call; when set, every other filter is ignored (visual search returns its own bounded, unpaginated result set). */
  visualSlugs?: string[];
}

// --- Admin shapes ----------------------------------------------------------

export interface AdminTranslation {
  locale: Locale;
  name: string;
  description: string | null;
  careInstructions: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  focusKeyword: string | null;
}

export interface AdminVariant {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  colorHex: string | null;
  priceOverride: number | null;
  stock: number;
  lowStockThreshold: number;
  isActive: boolean;
  order: number;
  skuIsManual: boolean;
  barcode: string | null;
  costPrice: number;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  preferredSupplierId: string | null;
}

export interface AdminProduct {
  id: string;
  slug: string;
  kind: ProductKind;
  status: ProductStatus;
  categoryId: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  brandId: string | null;
  fabric: string | null;
  season: string | null;
  tags: string[];
  pieceCount: number | null;
  fabricMeters: number | null;
  stitchingAvailable: boolean;
  isConsumable: boolean;
  garmentTypeId: string | null;
  garmentTypeIds: string[];
  featuredRank: number;
  translations: AdminTranslation[];
  variants: AdminVariant[];
  images: Array<{
    id: string;
    url: string;
    alt: string | null;
    translations: Array<{ locale: string; alt: string }>;
    order: number;
    isPrimary: boolean;
  }>;
  category: { id: string; slug: string } | null;
  totalStock: number;
  lowStockVariants: number;
  updatedAt: string;
  code: string | null;
  noindex: boolean;
  canonicalOverride: string | null;
  options: AdminProductOption[];
}

export interface AdminCategory {
  id: string;
  slug: string;
  parentId: string | null;
  imageUrl: string | null;
  order: number;
  isActive: boolean;
  translations: Array<{ locale: Locale; name: string; description: string | null }>;
  _count: { products: number; children: number };
}

export interface AdminBrand {
  id: string;
  slug: string;
  logoUrl: string | null;
  order: number;
  isActive: boolean;
  translations: Array<{ locale: Locale; name: string; description: string | null }>;
  _count?: { products: number };
}

export interface OptionValueTranslation {
  locale: Locale;
  label: string;
}

export interface AdminOptionTemplateValue {
  id: string;
  key: string;
  swatchHex: string | null;
  swatchUrl: string | null;
  order: number;
  translations: OptionValueTranslation[];
}

export interface AdminOptionTemplate {
  id: string;
  key: string;
  display: 'BUTTON' | 'DROPDOWN' | 'SWATCH' | 'TEXT';
  order: number;
  translations: OptionValueTranslation[];
  values: AdminOptionTemplateValue[];
}

export interface AdminProductOption {
  id: string;
  productId: string;
  key: string;
  display: 'BUTTON' | 'DROPDOWN' | 'SWATCH' | 'TEXT';
  order: number;
  translations: OptionValueTranslation[];
  values: AdminOptionTemplateValue[];
}

export interface AdminRedirect {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: number;
  isAutomatic: boolean;
  hitCount: number;
  createdAt: string;
}

export interface SeoHealthRow {
  id: string;
  slug: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  name: string;
  passed: boolean;
  failures: string[];
}

export type AiSuggestionKind = 'ALT_TEXT' | 'META_TITLE' | 'META_DESCRIPTION' | 'DESCRIPTION' | 'CARE_INSTRUCTIONS';
export type AiSuggestionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AiSuggestion {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  imageUrl: string | null;
  kind: AiSuggestionKind;
  locale: string;
  suggestedText: string;
  status: AiSuggestionStatus;
  createdAt: string;
  reviewedAt: string | null;
}

export interface AiStatus {
  providers: { anthropic: boolean; openai: boolean };
  capabilities: { complete: boolean; embed: boolean; vision: boolean };
  monthlyBudgetPaisa: number | null;
  usdToPkrRate: number;
  monthToDateSpendPaisa: number;
}

// WO-35, docs/implementation/ai-layer/35-scalable-rag-document-retrieval.md.
export type DocumentCorpus = 'EMPLOYEE_DOCUMENTS' | 'SUPPLIER_CATALOG' | 'BUSINESS_DOCUMENTS' | 'KNOWLEDGE_BASE';
export type IngestStatus = 'QUEUED' | 'EXTRACTING' | 'CHUNKING' | 'EMBEDDING' | 'READY' | 'FAILED';

export interface DocumentSourceRow {
  id: string;
  organizationId: string | null;
  originalName: string;
  corpus: DocumentCorpus;
  status: IngestStatus;
  pageCount: number | null;
  ingestedAt: string | null;
  failureReason: string | null;
  uploadedById: string | null;
  createdAt: string;
  chunkCount: number;
}

export interface RagStatus {
  retrievalAvailable: boolean;
  generationAvailable: boolean;
}

export interface RagQueryHit {
  id: string;
  sourceId: string;
  pageFrom: number;
  pageTo: number;
  text: string;
  score: number;
}

export interface RagCitation {
  sourceId: string;
  originalName: string;
  pageFrom: number;
  pageTo: number;
}

export interface RagAnswer {
  text: string;
  citations: RagCitation[];
}

export interface MeasurementFieldRow {
  id: string;
  key: string;
  labelEn: string;
  labelUr: string;
  unit: 'INCH' | 'CM';
  min: number;
  max: number;
  required: boolean;
  order: number;
  helpEn: string | null;
  helpUr: string | null;
  isActive: boolean;
}

export interface GarmentType {
  id: string;
  key: string;
  labelEn: string;
  labelUr: string;
  order: number;
  isActive: boolean;
  /** Base stitching fee in paisa. Falls back here when no premium service product is picked. */
  stitchingPrice: number;
  /** Offered in the stitching flow at all. */
  stitchingEnabled: boolean;
  fields: MeasurementFieldRow[];
  /** Flat PDF-benchmark fabric requirement in Gaz, used when the yardage formula can't be applied. */
  baseFabricGaz: number | null;
  /** Regional/Urdu synonyms surfaced as search aliases, e.g. "Anarkali" -> "Kalidar Frock". */
  aliasesEn: string[];
  aliasesUr: string[];
}

/** One row of a garment's RTW size chart, keyed by measurement field key. */
export interface AdminGarmentSizeChartRow {
  id: string;
  garmentTypeId: string;
  sizeToken: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
  values: Record<string, number>;
  order: number;
}

/** WO-9.2 — "Based on your measurements, take M." Arithmetic, not AI; null whenever nothing can be recommended (guest, no saved profile, no size chart). */
export interface SizeRecommendation {
  garmentTypeId: string;
  garmentTypeLabel: string;
  profileId: string;
  recommendedSize: string;
  matchedSize: string;
  confidence: 'high' | 'medium' | 'low';
  shiftedForFit: 'up' | 'down' | null;
  unavailableFallback: boolean;
}

/** The garment region a design option group belongs to. Null groups are ungrouped. */
export type StitchingDesignArea =
  | 'neck'
  | 'sleeves'
  | 'upper_front'
  | 'lower_front'
  | 'back'
  | 'trouser'
  | 'finishing'
  | 'bodice'
  | 'skirt_panel'
  | 'outerwear'
  | null;

export interface AdminStitchingOption {
  id: string;
  groupId: string;
  key: string;
  labelEn: string;
  labelUr: string;
  /** Paisa. Negative deltas discount the garment. */
  priceDelta: number;
  imageUrl: string | null;
  order: number;
  isActive: boolean;
}

export interface AdminStitchingOptionGroup {
  id: string;
  key: string;
  labelEn: string;
  labelUr: string;
  area: StitchingDesignArea;
  /** Null scopes the group to every garment. */
  garmentTypeId: string | null;
  garmentType?: { id: string; key: string; labelEn: string; labelUr: string } | null;
  selectionType: 'SINGLE' | 'MULTI';
  required: boolean;
  /** Render a free-text box alongside the choices. */
  allowCustomText: boolean;
  helpEn: string | null;
  helpUr: string | null;
  order: number;
  isActive: boolean;
  options: AdminStitchingOption[];
}

export interface ImportRowResult {
  row: number;
  sku: string;
  action: 'created' | 'updated' | 'skipped';
  message?: string;
}

export interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  results: ImportRowResult[];
}

/** WO-9.10 (09-ai-layer.md) — every suggestion here is reviewed and accepted or ignored by hand; nothing is written by `assist()` itself. */
export interface ColumnMappingSuggestion {
  header: string;
  column: string | null;
}

export interface ValueNormalizationSuggestion {
  column: string;
  raw: string;
  suggested: string;
}

export interface DuplicateFlag {
  rows: number[];
  nameEn: string[];
  reason: string;
}

export interface CategorySuggestion {
  row: number;
  suggestedCategorySlug: string;
}

export interface TranslationSuggestion {
  row: number;
  field: 'name_ur' | 'description_ur';
  suggestedText: string;
}

export interface ImportAssistanceResult {
  headersAlreadyMatch: boolean;
  columnMapping: ColumnMappingSuggestion[];
  valueSuggestions: ValueNormalizationSuggestion[];
  duplicateFlags: DuplicateFlag[];
  categorySuggestions: CategorySuggestion[];
  translationSuggestions: TranslationSuggestion[];
}

/**
 * The generic shape `ContactImportService`/`ExpenseImportService` share
 * (admin-platform/72-fragmented-tool-consolidation-import.md) — `key` names
 * whatever the row is identified by (a phone/email, a description), unlike
 * `ProductImportService`'s SKU-specific `ImportRowResult` above.
 */
export interface CsvImportRowResult {
  row: number;
  key: string;
  action: 'created' | 'updated' | 'skipped';
  message?: string;
}

export interface CsvImportSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  results: CsvImportRowResult[];
}

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  /** Every custom Role name this user holds — plural, resolved fresh server-side on every request. Empty for a brand-new signup whose default role has since been renamed or removed. */
  roles: string[];
  /**
   * Resolved server-side from every held role's current grants, plus this
   * user's own overrides — @see nav-registry.ts. Typed against the shared
   * catalogue, not `string[]`: a mistyped key in a
   * `permissions.includes(...)` check does not throw, it silently hides the
   * control it was guarding, which is the kind of bug nobody reports.
   */
  permissions: PermissionKey[];
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  user: AuthUser;
}

/** GET /meta — which optional modules and sector packs this deployment has enabled. */
export interface DeploymentMeta {
  modules: string[];
  packs: string[];
  /** 'STANDALONE' for every deployment today. Chain-topology UI must stay hidden until this is something else — see docs/implementation/RETAIL-ERP.md R14. */
  nodeRole: 'STANDALONE' | 'BRANCH' | 'BRAND' | 'ORG';
}

// --- Organization (RETAIL-ERP.md R19, WO-18.5) -------------------------------
// Empty for every deployment today — `organization` module off by default.

export interface RetailBrandSummary {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  organizationId: string | null;
  parentId: string | null;
}

export interface OrgNodeSummary {
  id: string;
  nodeId: string;
  role: 'BRANCH' | 'BRAND';
  label: string;
  status: 'ACTIVE' | 'SUSPENDED';
  /** WO-23.3c/e — which brand this node belongs to; null until an operator sets it. Governs its BrandPolicy checks on replication receipt. */
  retailBrandId: string | null;
}

/** GET /organization/me/scope — where the caller lands, and what chips they see. */
export interface MyScope {
  isOrgWide: boolean;
  /**
   * The authoritative landing signal — check this, never `brands.length`.
   * `brands` is deliberately widened to include a BRANCH grant's own
   * parent brand for breadcrumb visibility, so it is non-empty even for a
   * BRANCH-level actor.
   */
  level: 'ORG' | 'BRAND' | 'BRANCH' | 'NONE';
  organization: { id: string; name: string } | null;
  brands: RetailBrandSummary[];
  nodes: OrgNodeSummary[];
}

/** GET/POST /organization/admin-scopes (WO-18.6) — who is a super admin, a brand admin, or a branch admin. Only reachable by an ORG-scoped holder of organization.manage. */
export interface AdminScopeWithHolder {
  id: string;
  level: 'ORG' | 'BRAND' | 'BRANCH';
  retailBrandId: string | null;
  branchNodeId: string | null;
  createdAt: string;
  user: { id: string; email: string | null; firstName: string | null; lastName: string | null };
}

/**
 * GET /organization/policy-quarantine (WO-23.3c/e, RETAIL-ERP.md R9) — a
 * fact that applied but whose own `scopeLevel` disagreed with the
 * `BrandPolicy` switch meant to govern the node that raised it. Accepted,
 * never rejected — held here for review instead.
 */
export interface PolicyQuarantineEntry {
  id: string;
  originNodeId: string;
  entity: string;
  entityId: string;
  policyKey: string;
  retailBrandId: string | null;
  payload: unknown;
  reason: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolvedNote: string | null;
}

export interface GrantScopeInput {
  userId: string;
  level: 'ORG' | 'BRAND' | 'BRANCH';
  retailBrandId?: string;
  branchNodeId?: string;
}

/**
 * GET/PATCH /organization/brands/:brandId/policy (WO-23.3b, RETAIL-ERP.md
 * R9/R13) — a brand's own switches for its branches. `null` from the GET
 * means no row exists yet, which reads the same as every switch being off
 * (the API's own default).
 */
export interface BrandPolicy {
  retailBrandId: string;
  allowBranchProductCreation: boolean;
  allowBranchLocalPurchasing: boolean;
  allowInterBranchTransfers: boolean;
}

export interface UpdateBrandPolicyInput {
  allowBranchProductCreation?: boolean;
  allowBranchLocalPurchasing?: boolean;
  allowInterBranchTransfers?: boolean;
}

// --- Inventory --------------------------------------------------------------

/** GET /admin/inventory/locations — never an in-transit bucket (WO-22.1). */
export interface Location {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
  type: 'STORE' | 'WAREHOUSE' | 'PRODUCTION';
  /** WO-23.3c/e/d — null means no brand recorded, which an org-central WAREHOUSE Location uses on purpose (RETAIL-ERP.md R13). */
  retailBrandId: string | null;
}

export interface StockAdjustment {
  id: string;
  variantId: string;
  delta: number;
  resultingStock: number;
  reason: string;
  note: string | null;
  actorId: string | null;
  actorName?: string;
  createdAt: string;
}

export interface InventoryVariantRow {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  productName: string;
  stock: number;
  lowStockThreshold: number;
  isActive: boolean;
}

// --- Analytics ---------------------------------------------------------------

export interface StitchingAnalytics {
  topGarments: Array<{ garmentKey: string; garmentLabel: string; jobCount: number; revenue: number }>;
  topOptions: Array<{ optionLabel: string; groupLabel: string; pickCount: number }>;
  revenueByGarment: Array<{ garmentLabel: string; revenue: number }>;
}

export interface ExtendedAnalytics {
  cartAbandonment: { cartsStarted: number; ordersPlaced: number; abandonedRate: number };
  revenueByCategory: Array<{ categoryName: string; revenue: number }>;
  returnRate: { returned: number; cancelled: number; total: number; ratePercent: number };
  averageFulfillmentDays: number | null;
  paymentMethodSplit: Array<{ provider: string; count: number; revenue: number }>;
  revenueByCity: Array<{ city: string; revenue: number; orders: number }>;
}

// --- Visitor analytics --------------------------------------------------------

export interface VisitorFunnel {
  productViews: number;
  addToCart: number;
  checkoutStarted: number;
  purchasesCompleted: number;
}

export interface TrafficSourceRow {
  source: string;
  count: number;
  percent: number;
}

export interface VisitorAnalytics {
  totalVisitors: number;
  visitorsChangePercent: number | null;
  funnel: VisitorFunnel;
  trafficSources: TrafficSourceRow[];
  abandonedCarts: number;
}

/** Amounts in paisa. */
export interface MonthlyTarget {
  targetAmount: number;
  achievedAmount: number;
  percent: number;
}

// --- WO-D.1: orders overview / fulfilment ------------------------------------

export interface OrderAgeingBucket {
  label: string;
  count: number;
}

export interface OrdersOverview {
  ageing: OrderAgeingBucket[];
  oldestOpen: Array<{ id: string; number: string; status: string; placedAt: string; ageDays: number }>;
  byCity: Array<{ city: string; count: number; avgAgeDays: number }>;
  byPayment: Array<{ provider: string; count: number; avgAgeDays: number }>;
}

export interface OrderTransitionTiming {
  from: string;
  to: string;
  count: number;
  avgHours: number;
  medianHours: number;
}

export interface OrdersFulfilment {
  transitions: OrderTransitionTiming[];
}

// --- WO-D.2: purchasing spend / suppliers ------------------------------------

export interface PurchasingSpend {
  totals: { ordered: number; received: number; billed: number; unpaid: number };
  series: Array<{ date: string; ordered: number; received: number }>;
  byCategory: Array<{ category: string; spend: number }>;
}

export interface PurchasingSupplierRow {
  supplierId: string;
  name: string;
  spend: number;
  orders: number;
  onTimeRateBps: number | null;
  avgLeadDays: number | null;
  share: number;
  /** WO-9.9 — average PUBLISHED Review.rating across every product this supplier supplies, all-time. Null with no reviews yet. */
  avgProductRating: number | null;
  productReviewCount: number;
}

export interface PurchasingSuppliers {
  rows: PurchasingSupplierRow[];
}

// --- WO-D.3: products top/slow-sellers, categories ---------------------------

export interface ProductTopSellerRow {
  productId: string | null;
  variantId: string | null;
  sku: string;
  name: string;
  units: number;
  revenue: number;
  /** Absent (not present as a key) without inventory.view_cost. */
  cogs?: number;
  marginBps?: number;
}

export interface ProductsTopSellers {
  rows: ProductTopSellerRow[];
}

export interface ProductSlowSellerRow {
  productId: string;
  variantId: string;
  sku: string;
  name: string;
  daysSinceLastSale: number;
  ageDays: number;
}

export interface ProductsSlowSellers {
  rows: ProductSlowSellerRow[];
}

export interface ProductCategoryRow {
  categoryId: string | null;
  name: string;
  revenue: number;
  units: number;
  productCount: number;
  share: number;
}

export interface ProductsCategories {
  rows: ProductCategoryRow[];
  series: Array<{ date: string; revenue: number }>;
}

// --- WO-D.4: inventory valuation / movements ---------------------------------

export interface InventoryValuation {
  totals: { units: number; value: number; unknownCostVariants: number };
  byCategory: Array<{ categoryId: string | null; name: string; units: number; value: number }>;
  byKind: Array<{ kind: string; units: number; value: number }>;
  ageing: Array<{ label: string; units: number; value: number }>;
}

export interface StockMovementReasonRow {
  reason: string;
  in: number;
  out: number;
  count: number;
}

export interface InventoryMovementRow {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  reason: string;
  delta: number;
  createdAt: string;
}

export interface InventoryMovements {
  series: Array<{ date: string; in: number; out: number }>;
  byReason: StockMovementReasonRow[];
  recent: InventoryMovementRow[];
}

// --- WO-D.5: customers overview / retention / top ----------------------------

export interface CustomersOverview {
  totals: { total: number; repeat: number; newThisMonth: number };
  byCity: Array<{ city: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
}

export interface CustomerCohort {
  cohort: string;
  size: number;
  retained: number;
}

export interface CustomersRetention {
  cohorts: CustomerCohort[];
  repeatRateBps: number;
}

export interface CustomerTopRow {
  contactId: string;
  name: string;
  city: string | null;
  orders: number;
  lifetimeValue: number;
  avgOrderValue: number;
  lastOrderAt: string | null;
}

export interface CustomersTop {
  rows: CustomerTopRow[];
}

// --- WO-D.6: workshop output --------------------------------------------------

export interface WorkshopStageRow {
  stage: string;
  count: number;
  avgHours: number;
}

export interface WorkshopTailorRow {
  tailorId: string;
  name: string;
  jobsCompleted: number;
  avgHours: number;
}

export interface WorkshopOutput {
  series: Array<{ date: string; started: number; completed: number }>;
  byStage: WorkshopStageRow[];
  byTailor: WorkshopTailorRow[];
  bottleneck: { stage: string; avgHours: number } | null;
}

// --- Payroll: compensation, leave, pay runs (docs/implementation/payroll/19-payroll.md) --

export type CompensationBasis = 'MONTHLY' | 'HOURLY' | 'COMMISSION';

export interface CompensationRate {
  id: string;
  userId: string;
  basis: CompensationBasis;
  amountMinor: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface EmployeeCompensation {
  current: CompensationRate | null;
  history: CompensationRate[];
}

export interface GrossPreview {
  grossMinor: number;
  rateIds: string[];
  missingInput: boolean;
}

export type LeaveKind = 'ANNUAL' | 'SICK' | 'UNPAID' | 'OTHER';

export interface LeaveType {
  id: string;
  key: string;
  name: string;
  kind: LeaveKind;
  accrualDaysPerRun: number;
  isActive: boolean;
}

export interface LeaveBalance {
  id: string;
  userId: string;
  leaveTypeId: string;
  balance: number;
  updatedAt: string;
  leaveType: LeaveType;
}

export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveRequest {
  id: string;
  userId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: LeaveRequestStatus;
  decidedById: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  leaveType: LeaveType;
  user?: { id: string; firstName: string | null; lastName: string | null; email: string | null };
}

export interface EmployeeLeave {
  balances: LeaveBalance[];
  requests: LeaveRequest[];
}

export type PayRunStatus = 'DRAFT' | 'APPROVED' | 'POSTED';

export interface PayRunLine {
  id: string;
  payRunId: string;
  userId: string;
  compensationRateId: string;
  grossMinor: number;
  unpaidLeaveDays: number;
  unpaidLeaveMinor: number;
  deductions: unknown;
  deductionsMinor: number;
  netMinor: number;
  user: { id: string; firstName: string | null; lastName: string | null; email: string | null };
}

export type PayRunAdjustmentReason = 'OVERPAYMENT' | 'UNDERPAYMENT' | 'CORRECTION';

export interface PayRunAdjustment {
  id: string;
  payRunId: string;
  userId: string;
  reason: PayRunAdjustmentReason;
  amountMinor: number;
  note: string;
  createdById: string | null;
  createdAt: string;
}

export interface PayRun {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  status: PayRunStatus;
  scopeLevel: 'ORG' | 'BRAND' | 'BRANCH';
  originNodeId: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  postedAt: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface PayRunWithLines extends PayRun {
  lines: PayRunLine[];
  adjustments: PayRunAdjustment[];
}

// --- Settings: roles & permissions, audit log --------------------------------

export type EmailAccountPurpose = 'TRANSACTIONAL' | 'MARKETING' | 'SUPPORT';

export interface EmailAccount {
  id: string;
  label: string;
  purpose: EmailAccountPurpose;
  isActive: boolean;
  isDefault: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpVerifiedAt: string | null;
  hasSmtpPassword: boolean;
  imapHost: string | null;
  imapPort: number | null;
  imapSecure: boolean;
  imapUser: string | null;
  imapVerifiedAt: string | null;
  hasImapPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateCatalogEntry {
  key: string;
  label: string;
  category: 'Orders' | 'Payments' | 'Account' | 'Stitching' | 'Marketing';
  trigger: 'automatic' | 'manual';
  triggerDescription: string;
}

export interface RenderedEmailPreview {
  subject: string;
  html: string;
  text: string;
}

// --- Support inbox (IMAP replies) --------------------------------------------

export interface InboundEmailReply {
  id: string;
  body: string;
  sentAt: string;
  actor: { id: string; firstName: string | null; lastName: string | null } | null;
}

export interface InboundEmail {
  id: string;
  fromAddress: string;
  fromName: string | null;
  subject: string | null;
  bodyText: string | null;
  receivedAt: string;
  contactId: string | null;
  contact: { id: string; name: string; phoneE164: string | null; email: string | null } | null;
  emailAccount: { id: string; label: string; purpose: EmailAccountPurpose };
  interactionId: string | null;
  createdAt: string;
  _count: { replies: number };
  /** Only present on the single-message GET, not the list. */
  replies?: InboundEmailReply[];
}

export interface WhatsAppMessage {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  aiGenerated: boolean;
  createdAt: string;
}

export interface WhatsAppConversation {
  id: string;
  contactId: string;
  phoneE164: string;
  startedAt: string;
  lastMessageAt: string;
  handedOffToHuman: boolean;
  handoffReason: string | null;
  handedOffAt: string | null;
  contact: { id: string; name: string; phoneE164: string | null };
  _count: { messages: number };
  /** Only present on the single-conversation GET, not the list. */
  messages?: WhatsAppMessage[];
}

export interface PermissionDefinition {
  id: string;
  key: string;
  label: string;
  category: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  data: unknown;
  ip: string | null;
  createdAt: string;
  actor: { id: string; firstName: string | null; lastName: string | null; email: string | null } | null;
}

export interface AuditLogPage {
  total: number;
  page: number;
  perPage: number;
  entries: AuditLogEntry[];
}

// --- Back-office user management ---------------------------------------------

export type BackOfficeRole = 'STAFF' | 'TAILOR' | 'ADMIN';

export interface AdminUser {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  role: BackOfficeRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface PermissionOverride {
  key: string;
  effect: 'GRANT' | 'REVOKE';
}

/** A custom Role (owner's request) this user holds, with its own permission set inline. */
export interface HeldRole {
  id: string;
  name: string;
  permissions: string[];
}

/** Non-blocking advisories — see RolesService.conflictsForUser() on the API. */
export interface UserRoleConflicts {
  redundantGrants: string[];
  overriddenRevokes: string[];
}

export interface AdminUserDetail extends AdminUser {
  /** Every custom Role this user holds — plural. */
  roles: HeldRole[];
  overrides: PermissionOverride[];
  effectivePermissions: string[];
  conflicts: UserRoleConflicts;
}

// --- Custom roles (owner's request) -----------------------------------------
// GET/POST/PATCH/DELETE /admin/roles — replaces the old fixed-role editor at
// /admin/settings/roles.

export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  userCount: number;
}

/** POST/PATCH /admin/roles response — `duplicateOfRoleName` is a suggestion, never a block. */
export interface RoleWriteResult {
  role: RoleSummary;
  duplicateOfRoleName: string | null;
}

// --- Customer account portal --------------------------------------------------

export interface CustomerAddress {
  id: string;
  label: string | null;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string;
  postalCode: string | null;
  country: string;
  isDefault: boolean;
}

export interface MeasurementProfile {
  id: string;
  label: string;
  garmentTypeId: string;
  values: Record<string, number>;
  notes: string | null;
  isDefault: boolean;
  createdAt: string;
  garmentType: { id: string; key: string; labelEn: string; labelUr: string };
}

export interface MeasurementProfileDetail extends Omit<MeasurementProfile, 'garmentType'> {
  garmentType: GarmentType;
}

export interface CustomerOrderSummary {
  number: string;
  status: string;
  placedAt: string;
  grandTotal: number;
  items: Array<{ nameEn: string; nameUr: string | null; imageUrl: string | null; quantity: number }>;
}

/** One move along a garment's workshop timeline. */
export interface StitchingTimelineEvent {
  fromStage?: StitchingStage | null;
  toStage: StitchingStage;
  createdAt: string;
  note?: string | null;
  photoUrl?: string | null;
}

export interface CustomerOrderItem {
  id: string;
  nameEn: string;
  nameUr: string | null;
  variantLabel: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  stitchingFeeUnit: number;
  lineTotal: number;
  /** Zero for every order while `tax.enabled` is off (15-tax-module.md's ship-safe default). */
  taxAmount: number;
  stitchingServiceName: string | null;
  garmentTypeKey: string | null;
  measurementSnapshot: { label: string; values: Record<string, number> } | null;
  optionsSnapshot: Array<{
    groupLabelEn: string;
    groupLabelUr: string;
    labelEn: string;
    labelUr: string;
  }> | null;
  /** Present once the garment is in the workshop. */
  stitchingJob: {
    number: string;
    stage: StitchingStage;
    dueAt: string | null;
    events: StitchingTimelineEvent[];
  } | null;
}

/** One order as its buyer sees it — signed in, or tracked with a phone number. */
export interface CustomerOrder {
  number: string;
  status: string;
  placedAt: string;
  itemsSubtotal: number;
  stitchingSubtotal: number;
  shippingFee: number;
  codFee: number;
  grandTotal: number;
  guestName: string | null;
  shippingAddress: {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    province: string;
  };
  items: CustomerOrderItem[];
  payments: Array<{
    id: string;
    provider: string;
    status: string;
    reference: string | null;
    meta: {
      accounts?: Array<{ bank: string; title: string; accountNumber: string; iban: string }>;
    } | null;
  }>;
  shipments: Array<{ courier: string; trackingNumber: string | null; trackingUrl: string | null }>;
  statusEvents: Array<{ toStatus: string; createdAt: string; note: string | null }>;
}

/** WO-6.6's seeded, editable reason list — never free text. */
export interface CustomerReturnReason {
  id: string;
  key: string;
  translations: Array<{ locale: string; label: string }>;
}

export interface CustomerReturnRequest {
  id: string;
  number: string;
  status: string;
  resolution: string | null;
  customerNote: string | null;
  refundAmount: number | null;
  requestedAt: string;
  order: { number: string };
  items: Array<{
    id: string;
    quantity: number;
    restockable: boolean | null;
    reason: { translations: Array<{ locale: string; label: string }> };
    orderItem: { nameEn: string; nameUr: string | null; variantLabel: string | null };
  }>;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

// --- Transfers (RETAIL-ERP.md R4, WO-22.1/22.2/22.3, WO-23.3d) ---------------
// `transfers` module is off by default — empty for a Solo deployment.

export interface StockTransferLine {
  id: string;
  variantId: string;
  quantityDispatched: number;
  quantityReceived: number;
  /** Snapshotted at dispatch, on every transfer (WO-23.3d) — what did this stock cost, landed. */
  unitCost: number | null;
}

export interface InterBranchInvoice {
  id: string;
  number: string;
  sourceRetailBrandId: string;
  destinationRetailBrandId: string;
  amountMinor: number;
  issuedAt: string;
}

export interface StockTransfer {
  id: string;
  number: string;
  status: 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';
  settlementMode: 'NONE' | 'INTERNAL_PL' | 'INVOICED';
  sourceLocationId: string;
  destinationLocationId: string;
  inTransitLocationId: string;
  note: string | null;
  createdAt: string;
  receivedAt: string | null;
  cancelledAt: string | null;
  lines: StockTransferLine[];
  interBranchInvoice: InterBranchInvoice | null;
}

export interface StockTransferListResult {
  data: StockTransfer[];
  meta: { page: number; pageSize: number; total: number };
}

// --- Content (WO-8.1) -------------------------------------------------------

export interface CmsBanner {
  id: string;
  placementKey: string;
  imageUrl: string;
  linkUrl: string | null;
  translation?: { headline: string | null; subtext: string | null; altText: string | null };
}

export interface CmsPage {
  id: string;
  slug: string;
  template: string;
  translation?: { title: string; body: unknown[]; metaTitle: string | null; metaDescription: string | null };
}

export interface CmsPost {
  id: string;
  slug: string;
  category: string | null;
  tags: string[];
  heroImageUrl: string | null;
  publishedAt: string | null;
  translation?: {
    title: string;
    body: unknown[];
    excerpt: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
  };
}

/** `GET /admin/analytics/cards` (10-admin-dashboard.md D2, WO-A.4). */
export interface DashboardCardsResponse {
  days: number;
  from: string;
  to: string;
  generatedAt: string;
  /** Only keys the caller may see AND whose module is enabled — an absent key, not a hidden one. */
  metrics: Record<
    string,
    { value: number; previous: number | null; unit: 'paisa' | 'count' | 'bps' | 'days'; label?: string }
  >;
  series: Record<string, Array<{ t: string; v: number }>>;
}

/** `GET /admin/action-hub` (admin-platform/44-manager-action-hub.md D2). */
export interface ActionItem {
  id: string;
  kind: string;
  subjectEmployeeName: string;
  summary: string;
  /** ISO string, or null when there is no real deadline. */
  dueBy: string | null;
  href: string;
  permission: string;
}

export interface ActionHubResponse {
  items: ActionItem[];
  /** `kind`s whose source threw — the UI renders these as "temporarily unavailable", not a blank hub. */
  unavailableKinds: string[];
}

/** `GET /admin/feed` (analytics-reporting/58-live-operational-feed.md WO-58.3). */
export interface FeedEntry {
  id: string;
  kind: 'ORDER' | 'PURCHASE_ORDER' | 'PAYMENT';
  summary: string;
  /** ISO string. */
  occurredAt: string;
  href: string;
  locationId: string | null;
}

export interface FeedResponse {
  items: FeedEntry[];
  /** `kind`s whose source threw — the UI renders these as "temporarily unavailable", never a silently quiet feed. */
  unavailableKinds: string[];
}

export interface CmsMenuLink {
  id: string;
  parentId: string | null;
  url: string;
  label: string;
}

/** ProductCrossSell.kind (WO-9.6) — "MANUAL rows always outrank CO_OCCURRENCE/EMBEDDING ones at read time". */
export type ProductCrossSellKind = 'MANUAL' | 'CO_OCCURRENCE' | 'EMBEDDING';

export interface ProductCrossSellRow {
  id: string;
  kind: ProductCrossSellKind;
  order: number;
  relatedProduct: { id: string; slug: string; name: string };
}

export type MarkdownSuggestionStatus = 'PENDING' | 'CREATED' | 'DISMISSED';

export interface MarkdownSuggestion {
  id: string;
  variantId: string;
  discountId: string | null;
  suggestedBps: number;
  estimatedClearancePct: number;
  estimatedClearanceDays: number;
  marginBeforePaisa: number;
  marginAfterPaisa: number;
  status: MarkdownSuggestionStatus;
  createdAt: string;
  resolvedAt: string | null;
  variant: {
    id: string;
    sku: string;
    size: string | null;
    color: string | null;
    stock: number;
    product: { id: string; slug: string; translations: Array<{ name: string }> };
  };
}

// --- Personal API keys (docs/implementation/access-control-identity/163-personal-api-keys.md) ---
// Mirrors apps/api's ApiKeysService views. Never carries a secret, except
// `IssuedApiKey.secret` — in the one response that created or rotated it.

export type ApiKeyStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export type ApiKeyRevocationReason = 'OWNER' | 'ADMINISTRATOR' | 'OWNER_DEACTIVATED';

interface ApiKeyBase {
  id: string;
  name: string;
  surface: ApiKeySurface;
  /** `nxa_`/`nxs_` — shown with `lastFour` so a list can tell keys apart. */
  prefix: string;
  lastFour: string;
  permissionKeys: string[];
  customerScopes: string[];
  status: ApiKeyStatus;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
  revokedReason: ApiKeyRevocationReason | null;
}

/** One of your own keys, with what it can do right now. */
export interface ApiKeyView extends ApiKeyBase {
  /** Usable on the next request: an admin key's permissions its owner still holds, a store key's scopes. */
  effectiveScopes: string[];
  /** Admin keys only: carried, but paused because the owner no longer holds them. */
  pausedScopes: string[];
}

export interface IssuedApiKey {
  key: ApiKeyView;
  /** Shown once. The server keeps only its hash. */
  secret: string;
}

// --- Single sign-on (docs/implementation/access-control-identity/161-sso-identity-federation.md) ---
// Mirrors apps/api's SsoService views. Never carries the client secret —
// it is write-only, sent on create or when replaced, and never returned.

export type SsoConnectionStatus = 'ACTIVE' | 'SUSPENDED';

export interface SsoConnection {
  id: string;
  protocol: 'OIDC';
  label: string;
  issuerUrl: string;
  clientId: string;
  allowedEmailDomains: string[];
  defaultRoleName: string;
  status: SsoConnectionStatus;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  /** The callback URL to register at the provider; null until the server's API_PUBLIC_URL is set. */
  redirectUri: string | null;
}

/** `GET /admin/sso/connections` — the callback URL beside the rows, so it can be registered before the first one. */
export interface SsoConnectionList {
  redirectUri: string | null;
  connections: SsoConnection[];
}

/** A role, and the access-widening permissions that keep it from being a connection's default — empty when it can be one. */
export interface SsoDefaultRoleOption {
  name: string;
  accessWidening: string[];
}

/** One account created or linked through a connection, read from its audit trail. */
export interface SsoAccount {
  userId: string;
  /** Null once the account itself has been erased. */
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean | null;
  how: 'PROVISIONED' | 'LINKED';
  at: string;
  /** Still linked to the identity this connection linked — only then can it be unlinked. */
  linked: boolean;
}

/** `GET /auth/sso/connections` — public: what the sign-in screen draws a button for. */
export interface SsoSignInOption {
  id: string;
  label: string;
}

/** A key on the `users.manage` oversight list — its owner, never its secret. */
export interface ApiKeyOversightView extends ApiKeyBase {
  owner: {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    role: string;
    isActive: boolean;
  };
}

/**
 * doc 14 (commercial-licensing-agency/14-managed-services-module.md) — the
 * "Hosting & Billing" admin page's own data, as `GET /managed-services/usage`
 * and `GET /managed-services/invoices` return it (a thin server-side proxy
 * to the agency's Master Platform). `databaseBytes` is a numeric STRING —
 * the Master Platform's own `BigInt.prototype.toJSON` polyfill, never a
 * plain `number` (Postgres database sizes can exceed
 * `Number.MAX_SAFE_INTEGER` at scale).
 */
export interface ManagedServicesUsageSnapshot {
  snapshotDate: string;
  databaseBytes: string;
  emailsSent30d: number | null;
  activeUsers30d: number;
}

export type ManagedServicesTenantStatus = 'PROVISIONING' | 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'DEPROVISIONED';

export interface ManagedServicesUsageResponse {
  status: ManagedServicesTenantStatus;
  planKey: string;
  resourceTier: string;
  snapshots: ManagedServicesUsageSnapshot[];
}

export type ManagedServicesInvoiceStatus = 'ISSUED' | 'CREDITED';
export type ManagedServicesStripePaymentStatus = 'PENDING' | 'PAID' | 'FAILED';

export interface ManagedServicesInvoice {
  id: string;
  periodStart: string;
  periodEnd: string;
  amountMinor: number;
  status: ManagedServicesInvoiceStatus;
  issuedAt: string;
  dueAt: string | null;
  stripeHostedInvoiceUrl: string | null;
  stripePaymentStatus: ManagedServicesStripePaymentStatus | null;
}

/** `currency` travels with every response that carries money — the
 *  agency's OWN billing currency (`PLATFORM_BILLING_CURRENCY`), which can
 *  differ from this shop's own storefront `BRAND.currency` — never
 *  assumed by the page, always read from here. */
export interface ManagedServicesInvoicesResponse {
  currency: string;
  invoices: ManagedServicesInvoice[];
}

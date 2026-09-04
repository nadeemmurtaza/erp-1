import type { Locale, ProductKind, ProductStatus } from '@yaseen/shared';

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
  variants: ProductVariant[];
  category: { id: string; slug: string; name: string } | null;
  /** UNSTITCHED only: the garments this fabric can be made into. */
  garmentTypes: Array<{ id: string; key: string; label: string; baseFabricGaz: number | null }>;
  /** STITCHING_SERVICE only: the garment this service stitches. */
  serviceGarment: { id: string; key: string; label: string } | null;
  inStock: boolean;
  fromPrice: number;
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
}

// --- Admin shapes ----------------------------------------------------------

export interface AdminTranslation {
  locale: Locale;
  name: string;
  description: string | null;
  careInstructions: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
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
}

export interface AdminProduct {
  id: string;
  slug: string;
  kind: ProductKind;
  status: ProductStatus;
  categoryId: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  brand: string | null;
  fabric: string | null;
  season: string | null;
  tags: string[];
  pieceCount: number | null;
  fabricMeters: number | null;
  stitchingAvailable: boolean;
  garmentTypeId: string | null;
  garmentTypeIds: string[];
  featuredRank: number;
  translations: AdminTranslation[];
  variants: AdminVariant[];
  images: Array<{ id: string; url: string; alt: string | null; order: number; isPrimary: boolean }>;
  category: { id: string; slug: string } | null;
  totalStock: number;
  lowStockVariants: number;
  updatedAt: string;
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

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  role: 'CUSTOMER' | 'STAFF' | 'TAILOR' | 'ADMIN';
  /** Resolved server-side from the role's current grants — @see nav-registry.ts. */
  permissions: string[];
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
}

// --- Inventory --------------------------------------------------------------

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
}

export interface PermissionDefinition {
  id: string;
  key: string;
  label: string;
  category: string;
}

export interface RolePermissions {
  role: 'CUSTOMER' | 'STAFF' | 'TAILOR' | 'ADMIN';
  permissions: string[];
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

export interface AdminUserDetail extends AdminUser {
  roleDefaultPermissions: string[];
  overrides: PermissionOverride[];
  effectivePermissions: string[];
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

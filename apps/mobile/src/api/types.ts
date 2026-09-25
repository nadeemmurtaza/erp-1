import type { Locale, ProductKind, StitchingStage, UserRole } from '@newax/shared';

/** Shapes the API returns. Mirrors the same objects the website consumes. */

export interface Paginated<T> {
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

export interface ProductVariant {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  colorHex: string | null;
  price: number;
  stock: number;
  inStock: boolean;
}

/** Already flattened into one locale by the API. */
export interface Product {
  id: string;
  slug: string;
  kind: ProductKind;
  name: string;
  description: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  fabric: string | null;
  season: string | null;
  pieceCount: number | null;
  stitchingAvailable: boolean;
  images: Array<{ url: string; alt: string | null; isPrimary: boolean }>;
  variants: ProductVariant[];
  category: { id: string; slug: string; name: string } | null;
  garmentTypes: Array<{ id: string; key: string; label: string }>;
  serviceGarment: { id: string; key: string; label: string } | null;
  inStock: boolean;
  fromPrice: number;
}

export interface CartLine {
  id: string;
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  variantId: string;
  variantLabel: string | null;
  quantity: number;
  unitPrice: number;
  availableStock: number;
  exceedsStock: boolean;
  stitching: {
    serviceName: string;
    garmentLabel: string;
    measurementProfileLabel: string | null;
    options: Array<{ id: string; groupLabel: string; label: string; priceDelta: number }>;
    feePerUnit: number;
    notes: string | null;
  } | null;
  productTotal: number;
  stitchingTotal: number;
  lineTotal: number;
}

export interface Cart {
  id: string;
  token: string;
  items: CartLine[];
  itemCount: number;
  totals: { itemsSubtotal: number; stitchingSubtotal: number; grandTotal: number };
  issues: string[];
}

export interface StitchingOptionGroup {
  id: string;
  key: string;
  labelEn: string;
  labelUr: string;
  selectionType: 'SINGLE' | 'MULTI';
  required: boolean;
  order: number;
  options: Array<{
    id: string;
    key: string;
    labelEn: string;
    labelUr: string;
    priceDelta: number;
  }>;
}

export interface MeasurementField {
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
}

export interface GarmentType {
  id: string;
  key: string;
  labelEn: string;
  labelUr: string;
  order: number;
  fields: MeasurementField[];
}

export interface MeasurementProfile {
  id: string;
  label: string;
  garmentTypeId: string;
  values: Record<string, number>;
  isDefault: boolean;
  garmentType: { id: string; key: string; labelEn: string; labelUr: string };
}

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface TimelineEvent {
  fromStage?: StitchingStage | null;
  toStage: StitchingStage;
  createdAt: string;
  note?: string | null;
  photoUrl?: string | null;
}

export interface OrderItem {
  id: string;
  nameEn: string;
  nameUr: string | null;
  variantLabel: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  stitchingFeeUnit: number;
  lineTotal: number;
  stitchingServiceName: string | null;
  measurementSnapshot: { label: string; values: Record<string, number> } | null;
  stitchingJob: {
    number: string;
    stage: StitchingStage;
    dueAt: string | null;
    events: TimelineEvent[];
  } | null;
}

export interface Order {
  id: string;
  number: string;
  status: string;
  placedAt: string;
  itemsSubtotal: number;
  stitchingSubtotal: number;
  shippingFee: number;
  codFee: number;
  grandTotal: number;
  shippingAddress: {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string | null;
    city: string;
    province: string;
  };
  items: OrderItem[];
  payments: Array<{
    id: string;
    provider: string;
    status: string;
    /** Set once initiate() hands back a JazzCash/Easypaisa hosted-checkout form. */
    redirectUrl?: string | null;
    meta: {
      accounts?: Array<{ bank: string; title: string; accountNumber: string; iban: string }>;
      fields?: Record<string, string>;
    } | null;
  }>;
  statusEvents: Array<{ toStatus: string; createdAt: string; note: string | null }>;
}

export interface BookingJob {
  id: string;
  number: string;
  stage: StitchingStage;
  dueAt: string | null;
  instructions: string | null;
  garmentType: { labelEn: string; labelUr: string };
  events: TimelineEvent[];
}

export interface Booking {
  id: string;
  number: string;
  status: string;
  guestName: string | null;
  fabricNotes: string | null;
  fabricReceivedAt: string | null;
  promisedAt: string | null;
  quotedFee: number | null;
  jobs: BookingJob[];
}

export interface WorkshopJob {
  id: string;
  number: string;
  stage: StitchingStage;
  dueAt: string | null;
  instructions: string | null;
  measurementSnapshot: Record<string, unknown> | null;
  optionsSnapshot: Array<{ groupLabelEn?: string; labelEn?: string }> | null;
  garmentType: { labelEn: string; labelUr: string };
  assignedTailorId: string | null;
  assignedTailor: { id: string; firstName: string | null } | null;
  events: Array<TimelineEvent & { id: string; actor?: { firstName: string | null } | null }>;
  orderItem?: { order: { number: string; guestName: string | null } } | null;
  stitchingOrder?: { number: string; guestName: string | null } | null;
}

export interface PaymentMethod {
  key: string;
  labelEn: string;
  labelUr: string;
  descriptionEn: string | null;
  descriptionUr: string | null;
  /** Flat fee in paisa; cash on delivery carries one, bank transfer does not. */
  fee: number;
}

export interface ShippingQuote {
  zone: string;
  shippingFee: number;
  codFee: number;
}

// --- Phase 7: customer portal ------------------------------------------------

export interface WishlistItem {
  id: string;
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  price: number;
  variantId: string | null;
  variantLabel: string | null;
  inStock: boolean;
  createdAt: string;
}

export type ReviewStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED';

export interface Review {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: ReviewStatus;
  staffReply: string | null;
  helpfulCount: number;
  createdAt: string;
}

/** WO-6.6's seeded, editable reason list — never free text. */
export interface ReturnReason {
  id: string;
  key: string;
  translations: Array<{ locale: string; label: string }>;
}

export type ReturnStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'INSPECTED'
  | 'REFUNDED'
  | 'CLOSED';

export interface ReturnRequest {
  id: string;
  number: string;
  status: ReturnStatus;
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

export interface LoyaltyTier {
  id: string;
  name: string;
  minSpend: number;
  benefitDescriptionEn: string;
  benefitDescriptionUr: string | null;
}

export interface LoyaltyBalance {
  points: number;
  tier: LoyaltyTier | null;
  trailing12MonthSpend: number;
}

export interface LoyaltyLedgerEntry {
  id: string;
  type: 'EARNED' | 'REDEEMED' | 'REVERSED' | 'ADJUSTED';
  points: number;
  note: string | null;
  createdAt: string;
}

export interface Referral {
  id: string;
  rewardedAt: string | null;
  createdAt: string;
}

export interface StoreCreditLedgerEntry {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  note: string | null;
  createdAt: string;
}

export type NotificationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';
export type NotificationCategory = 'STITCHING_PROGRESS' | 'MARKETING' | 'BACK_IN_STOCK';

export interface NotificationPreferenceCell {
  channel: NotificationChannel;
  category: NotificationCategory;
  enabled: boolean;
}

export type { Locale };

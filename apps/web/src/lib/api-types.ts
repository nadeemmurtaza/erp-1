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
  garmentTypes: Array<{ id: string; key: string; label: string }>;
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
  fields: MeasurementFieldRow[];
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
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  user: AuthUser;
}

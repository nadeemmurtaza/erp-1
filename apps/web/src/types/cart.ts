import type { MeasurementFieldRow } from '@/types/api';

/** Shapes returned by the cart endpoints. Mirrors CartView in apps/api. */

export interface CartStitching {
  serviceId: string;
  serviceName: string;
  garmentKey: string;
  garmentLabel: string;
  measurementProfileId: string | null;
  measurementProfileLabel: string | null;
  options: Array<{ id: string; groupLabel: string; label: string; priceDelta: number }>;
  /** Base fee plus option deltas, for one unit, in paisa. */
  feePerUnit: number;
  notes: string | null;
}

export interface CartLine {
  id: string;
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  variantId: string;
  variantLabel: string | null;
  sku: string;
  quantity: number;
  unitPrice: number;
  availableStock: number;
  exceedsStock: boolean;
  stitching: CartStitching | null;
  productTotal: number;
  stitchingTotal: number;
  lineTotal: number;
}

export interface Cart {
  id: string;
  token: string;
  items: CartLine[];
  itemCount: number;
  totals: {
    itemsSubtotal: number;
    stitchingSubtotal: number;
    grandTotal: number;
  };
  /** Everything standing between this cart and a checkout. */
  issues: string[];
}

export interface StitchingOptionChoice {
  id: string;
  key: string;
  labelEn: string;
  labelUr: string;
  priceDelta: number;
  imageUrl: string | null;
}

export interface StitchingOptionGroup {
  id: string;
  key: string;
  labelEn: string;
  labelUr: string;
  /** Design area the group is rendered under: "neck", "sleeves", ... Null groups sit on their own. */
  area: string | null;
  selectionType: 'SINGLE' | 'MULTI';
  required: boolean;
  /** Render a free-text box alongside the choices. */
  allowCustomText: boolean;
  helpEn: string | null;
  helpUr: string | null;
  order: number;
  options: StitchingOptionChoice[];
}

/** One garment offered by GET /stitching/garments, with everything the panel needs to price it. */
export interface StitchingGarment {
  id: string;
  key: string;
  labelEn: string;
  labelUr: string;
  /** Base stitching fee in paisa. */
  stitchingPrice: number;
  fields: MeasurementFieldRow[];
  optionGroups: StitchingOptionGroup[];
  /** Flat PDF-benchmark fabric requirement in Gaz, used when the yardage formula can't be applied. */
  baseFabricGaz: number | null;
  /** Regional/Urdu synonyms surfaced as search aliases, e.g. "Anarkali" -> "Kalidar Frock". */
  aliasesEn: string[];
  aliasesUr: string[];
  /** RTW standard sizes for this garment, keyed by measurement field key. */
  sizeChart: Array<{ sizeToken: string; values: Record<string, number> }>;
}

/** Result of the fabric yardage calculator (packages/shared). */
export interface FabricEstimate {
  estimatedGaz: number;
  estimatedMetres: number;
  warnings: string[];
}

export interface MeasurementProfileSummary {
  id: string;
  label: string;
  garmentTypeId: string;
  values: Record<string, number>;
  garmentType: { id: string; key: string; labelEn: string; labelUr: string };
}

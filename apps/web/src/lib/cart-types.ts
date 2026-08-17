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
  selectionType: 'SINGLE' | 'MULTI';
  required: boolean;
  order: number;
  options: StitchingOptionChoice[];
}

export interface MeasurementProfileSummary {
  id: string;
  label: string;
  garmentTypeId: string;
  values: Record<string, number>;
  garmentType: { id: string; key: string; labelEn: string; labelUr: string };
}

/**
 * The commerce contracts — product, order, cart, inventory — in one import.
 *
 * These are split across api.ts (what the server returns), cart.ts (the cart's
 * own shapes) and stitching.ts (the apparel pack's) because that is how they
 * are maintained. This is the front door: a page wanting "the commerce types"
 * gets them here without needing to know which file each one lives in, and
 * without three separate import lines drifting apart as things move.
 */
export type {
  StorefrontProduct,
  ProductVariant,
  CategoryNode,
  CatalogFacets,
  ProductListQuery,
  PaginatedResponse,
  CustomerOrderSummary,
  AdminProduct,
  AdminVariant,
  AdminBrand,
} from './api';

export type { Cart, CartLine, CartStitching, StitchingGarment } from './cart';

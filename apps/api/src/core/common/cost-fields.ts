import type { PermissionKey } from '@newax/shared';
import type { AuthenticatedUser } from '../auth/auth.constants';

/**
 * The permission that gates visibility of cost / margin data.
 * Typed as PermissionKey so a rename is a compile error.
 */
export const VIEW_COST: PermissionKey = 'inventory.view_cost';

/**
 * Strips costPrice from each variant in a product (or product list) when the
 * caller lacks the VIEW_COST permission. Mutates the object in-place and
 * returns it for chaining.
 *
 * Called once per controller action -- the safe default is to OMIT cost, so
 * callers that forget the check are safe, not leaky.
 */
export function stripProductCost<T extends { variants: object[] }>(payload: T, user: AuthenticatedUser): T {
  if (!user.permissions.includes(VIEW_COST)) {
    for (const variant of payload.variants) {
      delete (variant as Record<string, unknown>).costPrice;
    }
  }
  return payload;
}

/**
 * Same as stripProductCost but for a paginated list { data: Product[] }.
 */
export function stripProductListCost<T extends { data: Array<{ variants: object[] }> }>(result: T, user: AuthenticatedUser): T {
  if (!user.permissions.includes(VIEW_COST)) {
    for (const product of result.data) {
      for (const variant of product.variants) {
        delete (variant as Record<string, unknown>).costPrice;
      }
    }
  }
  return result;
}

/**
 * Strips unitCost from each order item. Cost is never shown to customers;
 * for admin callers it is also hidden unless they hold VIEW_COST.
 *
 * Pass requirePermission=false for customer-facing routes where cost must
 * ALWAYS be stripped regardless of permissions.
 */
export function stripOrderCost<T extends { items: object[] }>(payload: T, user: AuthenticatedUser | undefined, requirePermission = true): T {
  const strip = !requirePermission || !user || !user.permissions.includes(VIEW_COST);
  if (strip) {
    for (const item of payload.items) {
      delete (item as Record<string, unknown>).unitCost;
    }
  }
  return payload;
}

/**
 * Same as stripOrderCost but for a paginated list { data: Order[] }.
 */
export function stripOrderListCost<T extends { data: Array<{ items: object[] }> }>(result: T, user: AuthenticatedUser | undefined, requirePermission = true): T {
  const strip = !requirePermission || !user || !user.permissions.includes(VIEW_COST);
  if (strip) {
    for (const order of result.data) {
      for (const item of order.items) {
        delete (item as Record<string, unknown>).unitCost;
      }
    }
  }
  return result;
}

/**
 * Which status a staff member may move an order to next.
 *
 * The API's own table in `apps/api/src/modules/sales/orders/orders.service.ts` is the authority and refuses a
 * transition not listed there; this copy only decides which buttons the admin offers. It was written out
 * in both the orders list and the order page, which is how two copies of one business rule come to disagree.
 * One place to change it on this side, and the API's table is the other.
 */
export const ORDER_NEXT_STATUS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['READY_TO_SHIP', 'CANCELLED'],
  READY_TO_SHIP: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

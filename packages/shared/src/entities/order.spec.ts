import {
  getOrderStatusLabel,
  getOrderCustomerName,
  getOrderDisplayTotal,
  getOrderItemCount,
} from './order';
import { toMinor } from '../constants';

describe('getOrderStatusLabel', () => {
  it('formats a single-word status', () => {
    expect(getOrderStatusLabel({ status: 'PENDING' })).toBe('Pending');
  });

  it('formats a multi-word status', () => {
    expect(getOrderStatusLabel({ status: 'READY_TO_SHIP' })).toBe('Ready To Ship');
  });
});

describe('getOrderCustomerName', () => {
  it('prefers the checkout-time snapshot (guestName) even when a user is attached', () => {
    // guestName is written for EVERY order, not only guest checkouts — it's
    // the House Rule 7 snapshot, and must win over the live account name,
    // which may have changed since the order was placed.
    expect(
      getOrderCustomerName({
        guestName: 'Name At Checkout',
        user: { firstName: 'Current', lastName: 'Name' },
      }),
    ).toBe('Name At Checkout');
  });

  it('falls back to the live user relation for a legacy row with no snapshot', () => {
    expect(getOrderCustomerName({ user: { firstName: 'Ayesha', lastName: 'Khan' } })).toBe('Ayesha Khan');
  });

  it('returns null with neither', () => {
    expect(getOrderCustomerName({})).toBeNull();
  });
});

describe('getOrderDisplayTotal', () => {
  it('formats the grand total', () => {
    expect(getOrderDisplayTotal({ grandTotal: toMinor(3499) }).replace(/\s/g, ' ')).toBe('Rs 3,499');
  });
});

describe('getOrderItemCount', () => {
  it('sums quantities across every line, not the number of lines', () => {
    expect(getOrderItemCount({ items: [{ quantity: 2 }, { quantity: 3 }] })).toBe(5);
  });

  it('is zero with no items', () => {
    expect(getOrderItemCount({})).toBe(0);
  });
});

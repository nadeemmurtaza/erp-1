import { toKitchenTicket, toReceipt, type PlacedPosSale } from './receipt';

const sale: PlacedPosSale = {
  number: 'YSN-2026-0001',
  placedAt: '2026-01-01T00:00:00.000Z',
  terminalId: 'terminal-1',
  itemsSubtotal: 1000,
  grandTotal: 1000,
  items: [{ nameEn: 'Kurta', sku: 'SKU1', quantity: 2, unitPrice: 500, lineTotal: 1000 }],
};

describe('toReceipt', () => {
  it('builds a print-ready shape carrying tender and change', () => {
    const receipt = toReceipt(sale, 'cashier-1', 1200, 200);

    expect(receipt).toEqual({
      orderNumber: 'YSN-2026-0001',
      placedAt: '2026-01-01T00:00:00.000Z',
      terminalId: 'terminal-1',
      cashierUserId: 'cashier-1',
      lines: [{ nameEn: 'Kurta', sku: 'SKU1', quantity: 2, unitPrice: 500, lineTotal: 1000 }],
      itemsSubtotal: 1000,
      grandTotal: 1000,
      tenderedMinor: 1200,
      changeMinor: 200,
    });
  });

  it('accepts placedAt as a Date and ISO-stringifies it', () => {
    const receipt = toReceipt({ ...sale, placedAt: new Date('2026-01-01T00:00:00.000Z') }, 'cashier-1', 1000, 0);
    expect(receipt.placedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

// pos-hardware/31 WO-31.5.
describe('toKitchenTicket', () => {
  it('zeroes every price field while keeping names, quantities and identity', () => {
    const receipt = toReceipt(sale, 'cashier-1', 1200, 200);
    const ticket = toKitchenTicket(receipt);

    expect(ticket.orderNumber).toBe(receipt.orderNumber);
    expect(ticket.lines).toEqual([{ nameEn: 'Kurta', sku: 'SKU1', quantity: 2, unitPrice: 0, lineTotal: 0 }]);
    expect(ticket.itemsSubtotal).toBe(0);
    expect(ticket.grandTotal).toBe(0);
    expect(ticket.tenderedMinor).toBe(0);
    expect(ticket.changeMinor).toBe(0);
  });
});

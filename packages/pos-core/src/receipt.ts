/**
 * The receipt model — a plain, print-ready shape built from a placed sale's
 * API response. Pure data only: no formatting (money/date display goes
 * through `@newax/shared`'s formatters at the point of render), no I/O.
 * Printing itself (a hardware bridge to a receipt printer) is WO-21.5's;
 * this is what that bridge, or an on-screen view, would both render from.
 */
export interface ReceiptLine {
  nameEn: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ReceiptData {
  orderNumber: string;
  placedAt: string;
  terminalId: string | null;
  cashierUserId: string;
  lines: ReceiptLine[];
  itemsSubtotal: number;
  grandTotal: number;
  tenderedMinor: number;
  changeMinor: number;
}

/** The minimal shape of a placeFromPos() response this file needs — not the full Order type. */
export interface PlacedPosSale {
  number: string;
  placedAt: string | Date;
  terminalId: string | null;
  itemsSubtotal: number;
  grandTotal: number;
  items: ReadonlyArray<{ nameEn: string; sku: string | null; quantity: number; unitPrice: number; lineTotal: number }>;
}

/**
 * pos-hardware/31 WO-31.5 — a kitchen-facing ticket for a `TAB`/`TABLE`
 * sale with modifiers: the same `ReceiptData` shape (so it reuses the one
 * `ReceiptPrinter` driver interface, never a second document type), with
 * every price field zeroed so nothing money-related prints on the kitchen
 * copy — a kitchen never needs to see what a dish costs.
 */
export function toKitchenTicket(receipt: ReceiptData): ReceiptData {
  return {
    ...receipt,
    lines: receipt.lines.map((line) => ({ ...line, unitPrice: 0, lineTotal: 0 })),
    itemsSubtotal: 0,
    grandTotal: 0,
    tenderedMinor: 0,
    changeMinor: 0,
  };
}

export function toReceipt(
  sale: PlacedPosSale,
  cashierUserId: string,
  tenderedMinor: number,
  changeMinor: number,
): ReceiptData {
  return {
    orderNumber: sale.number,
    placedAt: typeof sale.placedAt === 'string' ? sale.placedAt : sale.placedAt.toISOString(),
    terminalId: sale.terminalId,
    cashierUserId,
    lines: sale.items.map((item) => ({
      nameEn: item.nameEn,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    itemsSubtotal: sale.itemsSubtotal,
    grandTotal: sale.grandTotal,
    tenderedMinor,
    changeMinor,
  };
}

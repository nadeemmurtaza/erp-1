import { formatDateTime, formatMoney } from '@newax/shared';
import type { PosReceiptData } from '@/lib/pos-client';

/**
 * The receipt itself — an 80mm-width print layout (see globals.css's
 * `.receipt-print` rule). Renders the same on screen and on paper; the only
 * thing that changes at print time is that everything ELSE on the page
 * disappears.
 */
export function ReceiptView({ receipt }: { receipt: PosReceiptData }) {
  return (
    <div className="receipt-print mx-auto max-w-xs bg-white p-4 font-mono text-sm text-neutral-900">
      <p className="text-center text-base font-semibold">{receipt.orderNumber}</p>
      <p className="text-center text-xs text-neutral-500">{formatDateTime(receipt.placedAt)}</p>
      {receipt.customerName && <p className="mt-2 text-xs">Customer: {receipt.customerName}</p>}

      <div className="my-3 border-t border-dashed border-neutral-400" />

      {receipt.lines.map((line, i) => (
        <div key={i} className="mb-1 flex justify-between gap-2">
          <span>
            {line.nameEn} × {line.quantity}
            {line.sku && <span className="block text-xs text-neutral-500">{line.sku}</span>}
          </span>
          <span>{formatMoney(line.lineTotal)}</span>
        </div>
      ))}

      <div className="my-3 border-t border-dashed border-neutral-400" />

      <div className="flex justify-between font-semibold">
        <span>Total</span>
        <span>{formatMoney(receipt.grandTotal)}</span>
      </div>
      {receipt.paymentProvider && (
        <p className="mt-1 text-xs text-neutral-500">Paid by {receipt.paymentProvider}</p>
      )}

      <p className="mt-4 text-center text-xs text-neutral-400">Thank you</p>
    </div>
  );
}

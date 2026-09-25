'use client';

import { use, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatDate, formatMoney } from '@newax/shared';
import { getCustomerToken, getMyOrder } from '@/lib/customer-client';
import { businessProfile } from '@/config/business-profile';
import { Loading } from '@/components/ui';
import type { CustomerOrder } from '@/types/api';

/**
 * WO-7.2's invoice, rendered as a print-optimised page rather than a
 * server-generated binary PDF — this codebase has no PDF-generation library
 * anywhere (`.claude/rules/dependencies.md` asks for a named justification
 * and an approval step before adding one, which a mid-task addition cannot
 * get). The browser's own "Print → Save as PDF" produces the same customer-
 * facing artifact — order number, both addresses, lines, tax, payment
 * method, the shop's own {businessProfile.taxLabel} — without a new
 * dependency. `print:hidden` keeps the dashboard chrome (this route sits
 * outside it) and the print button off the printed page itself.
 */
export default function InvoicePage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = use(params);
  const t = useTranslations('order.invoice');
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!getCustomerToken()) {
      setError(true);
      return;
    }
    getMyOrder(number)
      .then(setOrder)
      .catch(() => setError(true));
  }, [number]);

  if (error) {
    return <p className="container-page py-8 text-sm text-red-700">{t('failed')}</p>;
  }
  if (!order) {
    return (
      <div className="container-page py-8">
        <Loading />
      </div>
    );
  }

  const paymentMethod = order.payments[0]?.provider ?? '—';
  const taxTotal = order.items.reduce((sum, item) => sum + item.taxAmount, 0);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-lg font-semibold">{t('title', { number: order.number })}</h1>
        <button type="button" onClick={() => window.print()} className="btn-primary">
          {t('print')}
        </button>
      </div>

      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-lg font-semibold">{businessProfile.name}</p>
          <p className="text-sm text-neutral-900/60">{businessProfile.address}</p>
          <p className="text-sm text-neutral-900/60">
            {businessProfile.taxLabel}: {businessProfile.taxNumber}
          </p>
        </div>
        <div className="text-end">
          <p className="text-sm text-neutral-900/60">{t('orderNumber')}</p>
          <p className="font-semibold">{order.number}</p>
          <p className="text-sm text-neutral-900/60">{formatDate(order.placedAt)}</p>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-6">
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-neutral-900/60">{t('billTo')}</p>
          <p className="text-sm">{order.shippingAddress.fullName}</p>
          <p className="text-sm text-neutral-900/60">{order.shippingAddress.phone}</p>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-neutral-900/60">{t('shipTo')}</p>
          <p className="text-sm">{order.shippingAddress.line1}</p>
          {order.shippingAddress.line2 ? <p className="text-sm">{order.shippingAddress.line2}</p> : null}
          <p className="text-sm">
            {order.shippingAddress.city}, {order.shippingAddress.province}
          </p>
        </div>
      </div>

      <table className="table-flat mb-6 w-full text-sm">
        <thead>
          <tr>
            <th className="text-start">{t('item')}</th>
            <th className="text-end">{t('quantity')}</th>
            <th className="text-end">{t('unitPrice')}</th>
            <th className="text-end">{t('lineTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.nameEn}
                {item.variantLabel ? <span className="text-neutral-900/60"> · {item.variantLabel}</span> : null}
              </td>
              <td className="text-end tabular-nums">{item.quantity}</td>
              <td className="text-end tabular-nums">{formatMoney(item.unitPrice)}</td>
              <td className="text-end tabular-nums">{formatMoney(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ms-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-900/60">{t('subtotal')}</span>
          <span className="tabular-nums">{formatMoney(order.itemsSubtotal + order.stitchingSubtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-900/60">{t('shipping')}</span>
          <span className="tabular-nums">{formatMoney(order.shippingFee)}</span>
        </div>
        {taxTotal > 0 ? (
          <div className="flex justify-between">
            <span className="text-neutral-900/60">{t('tax')}</span>
            <span className="tabular-nums">{formatMoney(taxTotal)}</span>
          </div>
        ) : null}
        {order.codFee > 0 ? (
          <div className="flex justify-between">
            <span className="text-neutral-900/60">{t('codFee')}</span>
            <span className="tabular-nums">{formatMoney(order.codFee)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-neutral-100 pt-1 font-semibold">
          <span>{t('total')}</span>
          <span className="tabular-nums">{formatMoney(order.grandTotal)}</span>
        </div>
        <div className="flex justify-between pt-2 text-neutral-900/60">
          <span>{t('paymentMethod')}</span>
          <span>{paymentMethod}</span>
        </div>
      </div>
    </div>
  );
}

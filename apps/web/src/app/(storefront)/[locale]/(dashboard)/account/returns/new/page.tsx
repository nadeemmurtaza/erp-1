'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Locale } from '@newax/shared';
import { getMyOrder, listReturnReasons, createReturnRequest } from '@/lib/customer-client';
import type { CustomerOrder, CustomerReturnReason } from '@/types/api';
import { Loading, PageHeader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';

interface LineState {
  selected: boolean;
  quantity: number;
  reasonId: string;
}

/** WO-6.6 — the customer's own side of the return-item portal CLAUDE.md's own feature-scope example names. */
export default function NewReturnRequestPage() {
  const t = useTranslations('returns');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get('number') ?? '';

  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [reasons, setReasons] = useState<CustomerReturnReason[] | null>(null);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!orderNumber) return;
    Promise.all([getMyOrder(orderNumber), listReturnReasons()])
      .then(([loadedOrder, loadedReasons]) => {
        setOrder(loadedOrder);
        setReasons(loadedReasons);
        setLines(
          Object.fromEntries(
            loadedOrder.items.map((item) => [
              item.id,
              { selected: false, quantity: item.quantity, reasonId: loadedReasons[0]?.id ?? '' },
            ]),
          ),
        );
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load this order'));
  }, [orderNumber]);

  async function submit() {
    if (!order) return;
    const items = Object.entries(lines)
      .filter(([, line]) => line.selected)
      .map(([orderItemId, line]) => ({ orderItemId, reasonId: line.reasonId, quantity: line.quantity }));

    if (items.length === 0) {
      setError(t('selectItems'));
      return;
    }

    setSubmitting(true);
    try {
      await createReturnRequest({ orderNumber: order.number, customerNote: note || undefined, items });
      router.push(ROUTES.storefront.accountReturns);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit the return request');
      setSubmitting(false);
    }
  }

  if (!order || !reasons) {
    return error ? (
      <p role="alert" className="text-sm text-red-700">
        {error}
      </p>
    ) : (
      <Loading />
    );
  }

  return (
    <>
      <PageHeader title={t('requestAction')} description={order.number} />

      {error ? (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <p className="mb-3 text-sm font-medium text-neutral-900">{t('selectItems')}</p>

      <ul className="mb-6 divide-y divide-neutral-100">
        {order.items.map((item) => {
          const line = lines[item.id];
          if (!line) return null;
          const name = (locale === 'ur' ? item.nameUr : item.nameEn) || item.nameEn;

          return (
            <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
              <input
                type="checkbox"
                className="field-check"
                checked={line.selected}
                onChange={(event) =>
                  setLines((current) => ({ ...current, [item.id]: { ...line, selected: event.target.checked } }))
                }
              />
              <span className="min-w-0 flex-1 text-sm font-medium text-neutral-900">
                {name}
                {item.variantLabel ? ` · ${item.variantLabel}` : ''}
              </span>
              <input
                type="number"
                min={1}
                max={item.quantity}
                value={line.quantity}
                disabled={!line.selected}
                onChange={(event) =>
                  setLines((current) => ({
                    ...current,
                    [item.id]: { ...line, quantity: Math.min(item.quantity, Math.max(1, Number(event.target.value))) },
                  }))
                }
                className="field-input w-16 py-1 text-sm"
                aria-label={t('quantity')}
              />
              <select
                value={line.reasonId}
                disabled={!line.selected}
                onChange={(event) =>
                  setLines((current) => ({ ...current, [item.id]: { ...line, reasonId: event.target.value } }))
                }
                className="field-input py-1 text-sm"
                aria-label={t('reason')}
              >
                {reasons.map((reason) => (
                  <option key={reason.id} value={reason.id}>
                    {reason.translations.find((tr) => tr.locale === locale)?.label ?? reason.translations[0]?.label}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>

      <label className="field-label mb-1 block" htmlFor="return-note">
        {t('note')}
      </label>
      <textarea
        id="return-note"
        className="field-input mb-6 w-full"
        rows={3}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      <button type="button" className="btn-primary" disabled={submitting} onClick={() => void submit()}>
        {t('submit')}
      </button>
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { formatDate, type Locale } from '@newax/shared';
import { Link } from '@/i18n/navigation';
import { getMyOrder, listReturnReasons, createReturnRequest } from '@/lib/customer-client';
import type { CustomerOrder, CustomerReturnReason, CustomerReturnRequest } from '@/types/api';
import { Loading, PageHeader, SuccessState } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { journeyStates } from '@/lib/success-state';

/**
 * The one open loop on a return request (SUC-4): the statuses the shop moves it through, each a change the
 * returns page already shows. A status maps to the last step it has reached; a rejected request is not on this
 * road, and a refund or an exchange is the shop's choice, so the road stops at the parcel arriving.
 */
const RETURN_JOURNEY = ['REQUESTED', 'APPROVED', 'RECEIVED'] as const;
const RETURN_REACHED: Record<string, number> = {
  REQUESTED: 0,
  APPROVED: 1,
  IN_TRANSIT: 1,
  RECEIVED: 2,
  INSPECTED: 2,
  REFUNDED: 2,
  CLOSED: 2,
};

interface LineState {
  selected: boolean;
  quantity: number;
  reasonId: string;
}

/** WO-6.6 — the customer's own side of the return-item portal CLAUDE.md's own feature-scope example names. */
export default function NewReturnRequestPage() {
  const t = useTranslations('returns');
  const tCommon = useTranslations('common');
  const locale = useLocale() as Locale;
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get('number') ?? '';

  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [reasons, setReasons] = useState<CustomerReturnReason[] | null>(null);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CustomerReturnRequest | null>(null);

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
      setCreated(await createReturnRequest({ orderNumber: order.number, customerNote: note || undefined, items }));
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

  // A request the shop will act on was made (SUC-3): say which one, and where it can be followed. It used to
  // jump to the list with no word that it had worked.
  if (created) {
    const states = journeyStates(RETURN_JOURNEY.length, RETURN_REACHED[created.status] ?? 0);
    const count = created.items.reduce((sum, line) => sum + line.quantity, 0);

    return (
      <div className="flex justify-center py-12">
        <SuccessState
          as="h1"
          focus
          linkAs={Link}
          title={t('successTitle', { number: created.number })}
          detail={t('successDetail', {
            count,
            order: created.order.number,
            date: formatDate(created.requestedAt, locale),
          })}
          primary={{ label: t('successView'), href: ROUTES.storefront.accountReturn(created.id) }}
          back={{ label: t('backToReturns'), href: ROUTES.storefront.accountReturns }}
          loop={{
            steps: RETURN_JOURNEY.map((status, index) => ({ label: t(`status.${status}`), state: states[index]! })),
            labels: {
              done: tCommon('journey.done'),
              current: tCommon('journey.current'),
              next: tCommon('journey.next'),
            },
          }}
        />
      </div>
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

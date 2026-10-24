'use client';

import { use, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate, formatMoney, type Locale } from '@newax/shared';
import { Link } from '@/i18n/navigation';
import { getMyReturn } from '@/lib/customer-client';
import type { CustomerReturnRequest } from '@/types/api';
import { Loading, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { ROUTES } from '@/constants/routes';

export default function MyReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('returns');
  const locale = useLocale() as Locale;
  const [request, setRequest] = useState<CustomerReturnRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyReturn(id)
      .then(setRequest)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load this return'));
  }, [id]);

  if (!request) {
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
      <PageHeader
        title={request.number}
        context={
          <Link href={ROUTES.storefront.order(request.order.number)} className="hover:underline">
            {t('backToOrder')}
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <StatusBadge status={request.status} label={t(`status.${request.status}`)} />
        <span className="text-sm text-neutral-900/60">{formatDate(request.requestedAt)}</span>
      </div>

      {request.refundAmount != null ? (
        <p className="mb-4 text-sm text-neutral-900">Refund: {formatMoney(request.refundAmount)}</p>
      ) : null}

      <ul className="divide-y divide-neutral-100">
        {request.items.map((item) => (
          <li key={item.id} className="py-3 text-sm">
            <p className="font-medium text-neutral-900">
              {(locale === 'ur' ? item.orderItem.nameUr : item.orderItem.nameEn) || item.orderItem.nameEn}
              {item.orderItem.variantLabel ? ` · ${item.orderItem.variantLabel}` : ''}
            </p>
            <p className="text-neutral-900/60">
              {t('quantity')}: {item.quantity} ·{' '}
              {item.reason.translations.find((tr) => tr.locale === locale)?.label ??
                item.reason.translations[0]?.label}
            </p>
          </li>
        ))}
      </ul>

      {request.customerNote ? (
        <p className="mt-4 rounded-md bg-neutral-50 p-4 text-sm text-neutral-900">{request.customerNote}</p>
      ) : null}
    </>
  );
}

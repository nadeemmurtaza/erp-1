'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { formatDateShort, type Locale } from '@newax/shared';
import { verifySerial, type SerialVerifyResult } from '@/lib/customer-client';
import { ROUTES } from '@/constants/routes';

/**
 * 158-serialized-unit-tracking.md §3. The narrow public warranty-verify
 * lookup — status, sale date and warranty only, never a branch or an
 * employee, matching `SerializedUnitsPublicController.verify()`'s own
 * minimal-disclosure shape exactly.
 */
export default function VerifyPurchasePage() {
  const t = useTranslations('warrantyVerify');
  const locale = useLocale() as Locale;

  const [serialNumber, setSerialNumber] = useState('');
  const [result, setResult] = useState<SerialVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!serialNumber.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const found = await verifySerial(serialNumber.trim());
      setResult(found);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('notFound'));
    } finally {
      setBusy(false);
    }
  }

  const warrantyActive = result?.warrantyEndsOn ? new Date(result.warrantyEndsOn) > new Date() : null;

  return (
    <div className="container-page py-10 lg:py-14">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-medium tracking-tight text-neutral-900 lg:text-3xl">{t('title')}</h1>
        <p className="mt-1.5 text-sm text-neutral-900/60">{t('description')}</p>

        <form onSubmit={onSubmit} className="mt-6 flex items-end gap-3">
          <label className="block flex-1">
            <span className="field-label">{t('inputLabel')}</span>
            <input
              className="field-input"
              value={serialNumber}
              onChange={(event) => setSerialNumber(event.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn-primary" disabled={busy || !serialNumber.trim()}>
            {t('submit')}
          </button>
        </form>

        {error ? (
          <p role="alert" className="notice notice-error mt-6">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="card mt-6 space-y-3 p-4">
            <p className="text-sm font-medium text-neutral-900">
              {result.serialNumber} — {t(`status.${result.status}`)}
            </p>
            {result.soldOn ? (
              <p className="text-sm text-neutral-900/70">
                {t('soldOn')}: {formatDateShort(result.soldOn, locale)}
              </p>
            ) : null}
            {result.orderNumber ? (
              <p className="text-sm text-neutral-900/70">
                {t('order')}: {result.orderNumber}
              </p>
            ) : null}
            {result.warrantyEndsOn ? (
              <p className={warrantyActive ? 'notice notice-success' : 'notice notice-error'}>
                {t('warrantyEndsOn')}: {formatDateShort(result.warrantyEndsOn, locale)} —{' '}
                {warrantyActive ? t('warrantyActive') : t('warrantyExpired')}
              </p>
            ) : result.soldOn ? (
              <p className="text-sm text-neutral-900/60">{t('noWarranty')}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 text-sm text-neutral-900/60">
          <Link href={ROUTES.storefront.home} className="font-medium text-accent-hover hover:underline">
            ← {t('backToShop')}
          </Link>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { formatMoney, type Locale } from '@yaseen/shared';
import { useCart } from '@/components/storefront/cart-provider';
import { useRouter } from '@/i18n/navigation';
import { API_URL, ApiError } from '@/lib/api';
import { getCustomerToken } from '@/lib/cart-client';

interface PaymentMethod {
  key: string;
  labelEn: string;
  labelUr: string;
  descriptionEn: string;
  descriptionUr: string;
  fee: number;
}

const PROVINCES = [
  'Sindh',
  'Punjab',
  'Khyber Pakhtunkhwa',
  'Balochistan',
  'Islamabad Capital Territory',
  'Gilgit-Baltistan',
  'Azad Jammu & Kashmir',
];

/**
 * Checkout.
 *
 * The page collects an address and a payment method and posts them; every
 * amount — shipping for the delivery city, the COD fee, the grand total — is
 * decided by the API. The summary here shows the cart's goods total and says
 * plainly that shipping is added on the confirmation, rather than guessing a
 * figure that might not match the charge.
 */
export default function CheckoutPage() {
  const t = useTranslations('checkout');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { cart, loading } = useCart();

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [method, setMethod] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    line1: '',
    line2: '',
    city: '',
    province: 'Sindh',
    postalCode: '',
    note: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`${API_URL}/payments/methods`)
      .then((response) => (response.ok ? response.json() : []))
      .then((loaded: PaymentMethod[]) => {
        setMethods(loaded);
        setMethod((current) => current || (loaded[0]?.key ?? ''));
      })
      .catch(() => undefined);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const token = getCustomerToken();
      const response = await fetch(`${API_URL}/orders?locale=${locale}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          shippingAddress: {
            fullName: form.fullName,
            phone: form.phone,
            line1: form.line1,
            line2: form.line2 || undefined,
            city: form.city,
            province: form.province,
            postalCode: form.postalCode || undefined,
          },
          paymentMethod: method,
          email: form.email || undefined,
          note: form.note || undefined,
        }),
      });

      const payload = await response.json().catch(() => undefined);

      if (!response.ok) {
        const message = (payload as { message?: string | string[] } | undefined)?.message;
        throw new ApiError(
          response.status,
          Array.isArray(message) ? message.join('\n') : (message ?? t('failed')),
        );
      }

      // A guest has no session, so the confirmation page would otherwise ask
      // them to prove who they are seconds after they ordered. Remember the
      // number they gave, for this tab only, so it can show their order
      // straight away; a returning visitor still gets the tracking form.
      sessionStorage.setItem(`yaseen.order.${payload.number}`, form.phone);

      // A full navigation, so the cart provider reloads and shows it emptied.
      window.location.href = `/${locale}/orders/${payload.number}?placed=1`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('failed'));
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="container-page py-16 text-center text-sm text-ink/50">…</div>;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-page py-16 text-center">
        <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
        <p className="mt-2 text-sm text-ink/60">{t('emptyCart')}</p>
      </div>
    );
  }

  if (cart.issues.length > 0) {
    return (
      <div className="container-page py-16">
        <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
        <ul className="mt-4 space-y-1 rounded-md border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
          {cart.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => router.push('/cart')}
          className="btn-secondary mt-6"
        >
          {t('backToCart')}
        </button>
      </div>
    );
  }

  const selectedMethod = methods.find((candidate) => candidate.key === method);

  return (
    <div className="container-page py-8">
      <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>

      <form onSubmit={submit} className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-ink">{t('deliveryAddress')}</h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={t('fullName')} required>
                <input
                  value={form.fullName}
                  onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                  required
                  autoComplete="name"
                  className="field-input"
                />
              </Field>

              <Field label={t('phone')} required hint={t('phoneHint')}>
                <input
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="03001234567"
                  className="field-input"
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label={t('address')} required>
                  <input
                    value={form.line1}
                    onChange={(event) => setForm({ ...form, line1: event.target.value })}
                    required
                    autoComplete="address-line1"
                    className="field-input"
                  />
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field label={t('address2')}>
                  <input
                    value={form.line2}
                    onChange={(event) => setForm({ ...form, line2: event.target.value })}
                    autoComplete="address-line2"
                    className="field-input"
                  />
                </Field>
              </div>

              <Field label={t('city')} required hint={t('cityHint')}>
                <input
                  value={form.city}
                  onChange={(event) => setForm({ ...form, city: event.target.value })}
                  required
                  autoComplete="address-level2"
                  className="field-input"
                />
              </Field>

              <Field label={t('province')} required>
                <select
                  value={form.province}
                  onChange={(event) => setForm({ ...form, province: event.target.value })}
                  className="field-input"
                >
                  {PROVINCES.map((province) => (
                    <option key={province} value={province}>
                      {province}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t('postalCode')}>
                <input
                  value={form.postalCode}
                  onChange={(event) => setForm({ ...form, postalCode: event.target.value })}
                  autoComplete="postal-code"
                  className="field-input"
                />
              </Field>

              <Field label={t('email')} hint={t('emailHint')}>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  autoComplete="email"
                  className="field-input"
                />
              </Field>
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-ink">{t('payment')}</h2>

            <div className="mt-4 space-y-2">
              {methods.map((option) => (
                <label
                  key={option.key}
                  className={clsx(
                    'flex cursor-pointer items-start gap-3 rounded-md border p-3',
                    option.key === method ? 'border-brand-500 bg-brand-50' : 'border-sand-200',
                  )}
                >
                  <input
                    type="radio"
                    name="payment-method"
                    checked={option.key === method}
                    onChange={() => setMethod(option.key)}
                    className="mt-1 border-sand-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="flex-1">
                    <span className="flex justify-between gap-3">
                      <span className="text-sm font-medium text-ink">
                        {locale === 'ur' ? option.labelUr : option.labelEn}
                      </span>
                      {option.fee > 0 ? (
                        <span className="text-sm text-ink/70">
                          +{formatMoney(option.fee, locale)}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink/60">
                      {locale === 'ur' ? option.descriptionUr : option.descriptionEn}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <Field label={t('note')} hint={t('noteHint')}>
              <textarea
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                rows={2}
                maxLength={500}
                className="field-input"
              />
            </Field>
          </section>
        </div>

        <aside className="card h-fit p-4 lg:sticky lg:top-24">
          <h2 className="text-sm font-semibold text-ink">{t('summary')}</h2>

          <ul className="mt-3 space-y-2 text-sm">
            {cart.items.map((line) => (
              <li key={line.id} className="flex justify-between gap-3">
                <span className="min-w-0 text-ink/70">
                  <span className="block truncate">{line.name}</span>
                  {line.stitching ? (
                    <span className="block text-xs text-brand-700">
                      + {line.stitching.serviceName}
                    </span>
                  ) : null}
                  <span className="text-xs text-ink/40">× {line.quantity}</span>
                </span>
                <span className="shrink-0 text-ink">{formatMoney(line.lineTotal, locale)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-2 border-t border-sand-200 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink/60">{t('goods')}</dt>
              <dd className="text-ink">{formatMoney(cart.totals.grandTotal, locale)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink/60">{t('shipping')}</dt>
              <dd className="text-ink/50">{t('shippingByCity')}</dd>
            </div>
            {selectedMethod && selectedMethod.fee > 0 ? (
              <div className="flex justify-between">
                <dt className="text-ink/60">
                  {locale === 'ur' ? selectedMethod.labelUr : selectedMethod.labelEn}
                </dt>
                <dd className="text-ink">+{formatMoney(selectedMethod.fee, locale)}</dd>
              </div>
            ) : null}
          </dl>

          <p className="mt-3 text-xs text-ink/50">{t('finalTotalNote')}</p>

          {error ? (
            <p
              role="alert"
              className="mt-4 whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={busy || !method} className="btn-primary mt-4 w-full">
            {busy ? t('placing') : t('placeOrder')}
          </button>
        </aside>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink/40">{hint}</span> : null}
    </label>
  );
}

'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { formatMoney, type Locale } from '@newax/shared';
import { Wizard, type WizardStep } from '@/components/common/wizard';
import { useCart } from '@/components/storefront/cart-provider';
import { useRouter } from '@/i18n/navigation';
import { trackEvent } from '@/lib/analytics-client';
import { API_URL, ApiError } from '@/lib/api';
import { getCustomerToken } from '@/lib/cart-client';
import { STORAGE_KEYS } from '@/constants/storage';

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

  useEffect(() => {
    // Once per mount, not once per re-render — this page re-renders on every
    // form keystroke.
    trackEvent('checkout_started');
  }, []);

  async function submit() {
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
      sessionStorage.setItem(STORAGE_KEYS.guestOrder(payload.number), form.phone);

      const gatewayFields = payload.payment?.meta?.fields as Record<string, string> | undefined;

      if (payload.payment?.redirectUrl && gatewayFields) {
        // JazzCash/Easypaisa: the order exists but isn't paid for yet — send
        // the customer to the gateway's hosted page instead of the order
        // page. They land back on the order page via checkout/callback/
        // [provider] once the gateway returns them.
        redirectToGateway(payload.payment.redirectUrl, gatewayFields);
        return;
      }

      // Cash on delivery / bank transfer: nothing more to collect now. A
      // full navigation, so the cart provider reloads and shows it emptied.
      window.location.href = `/${locale}/orders/${payload.number}?placed=1`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('failed'));
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="container-page py-16 text-center text-sm text-neutral-400">…</div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-page py-16 text-center font-display">
        <h1 className="text-2xl font-semibold text-neutral-900">{t('title')}</h1>
        <p className="mt-2 text-sm text-neutral-500">{t('emptyCart')}</p>
      </div>
    );
  }

  if (cart.issues.length > 0) {
    return (
      <div className="container-page pb-28 pt-16 font-display md:pb-16">
        <h1 className="text-2xl font-semibold text-neutral-900">{t('title')}</h1>
        <ul className="mt-4 space-y-1 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
          {cart.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => router.push('/cart')}
          className="btn-secondary mt-6 px-5 py-2.5"
        >
          {t('backToCart')}
        </button>
      </div>
    );
  }

  const selectedMethod = methods.find((candidate) => candidate.key === method);

  const addressValid = Boolean(
    form.fullName.trim() && form.phone.trim() && form.line1.trim() && form.city.trim() && form.province,
  );

  const steps: WizardStep[] = [
    {
      id: 'address',
      label: t('deliveryAddress'),
      isValid: addressValid,
      content: (
        <section className="card p-4 sm:p-6">
          <h2 className="text-base font-semibold text-neutral-900">{t('deliveryAddress')}</h2>

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
      ),
    },
    {
      id: 'payment',
      label: t('payment'),
      isValid: Boolean(method),
      content: (
        <section className="card p-4 sm:p-6">
          <h2 className="text-base font-semibold text-neutral-900">{t('payment')}</h2>

          {/*
           * The real payment options are cash-on-delivery and bank
           * transfer — no card gateway exists — so the native radio input
           * stays for semantics/keyboard support but is visually replaced
           * by a rounded card selector, not a fake card-entry field.
           */}
          <div className="mt-4 space-y-3">
            {methods.map((option) => (
              <label
                key={option.key}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-colors duration-200 focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2',
                  option.key === method
                    ? 'border-neutral-900 bg-neutral-900/[0.03]'
                    : 'border-neutral-200 hover:border-neutral-300',
                )}
              >
                <input
                  type="radio"
                  name="payment-method"
                  checked={option.key === method}
                  onChange={() => setMethod(option.key)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                    option.key === method ? 'border-neutral-900' : 'border-neutral-300',
                  )}
                >
                  {option.key === method ? (
                    <span className="h-2.5 w-2.5 rounded-full bg-neutral-900" />
                  ) : null}
                </span>
                <span className="flex-1">
                  <span className="flex justify-between gap-3">
                    <span className="text-sm font-medium text-neutral-900">
                      {locale === 'ur' ? option.labelUr : option.labelEn}
                    </span>
                    {option.fee > 0 ? (
                      <span className="text-sm text-neutral-500">
                        +{formatMoney(option.fee, locale)}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-500">
                    {locale === 'ur' ? option.descriptionUr : option.descriptionEn}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </section>
      ),
    },
    {
      id: 'review',
      label: t('reviewStep'),
      isValid: true,
      content: (
        <div className="space-y-6">
          <section className="card p-4 sm:p-6">
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

          <section className="card p-4 sm:p-6">
            <h2 className="text-base font-semibold text-neutral-900">{t('summary')}</h2>

            <ul className="mt-3 space-y-2 text-sm">
              {cart.items.map((line) => (
                <li key={line.id} className="flex justify-between gap-3">
                  <span className="min-w-0 text-neutral-600">
                    <span className="block truncate">{line.name}</span>
                    {line.stitching ? (
                      <span className="block text-xs text-neutral-500">
                        + {line.stitching.serviceName}
                      </span>
                    ) : null}
                    <span className="text-xs text-neutral-400">× {line.quantity}</span>
                  </span>
                  <span className="shrink-0 text-neutral-900">
                    {formatMoney(line.lineTotal, locale)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-2 border-t border-neutral-200 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t('goods')}</dt>
                <dd className="text-neutral-900">{formatMoney(cart.totals.grandTotal, locale)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t('shipping')}</dt>
                <dd className="text-neutral-400">{t('shippingByCity')}</dd>
              </div>
              {selectedMethod && selectedMethod.fee > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-neutral-500">
                    {locale === 'ur' ? selectedMethod.labelUr : selectedMethod.labelEn}
                  </dt>
                  <dd className="text-neutral-900">+{formatMoney(selectedMethod.fee, locale)}</dd>
                </div>
              ) : null}
            </dl>

            <p className="mt-3 text-xs text-neutral-400">{t('finalTotalNote')}</p>
          </section>
        </div>
      ),
    },
  ];

  return (
    <div className="container-page pb-28 pt-6 font-display sm:pt-8 md:pb-8">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
        {t('title')}
      </h1>

      <div className="mt-6 sm:mt-8">
        <Wizard
          steps={steps}
          onSubmit={submit}
          submitLabel={busy ? t('placing') : t('placeOrder')}
          submitBusy={busy}
          submitDisabled={busy || !method}
          accentClassName="bg-neutral-900 text-white"
          backLabel={t('back')}
          nextLabel={t('next')}
          error={
            error ? (
              <p
                role="alert"
                className="whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            ) : null
          }
        />
      </div>
    </div>
  );
}

/**
 * Sends the browser to a payment gateway's hosted checkout. JazzCash and
 * Easypaisa both take the customer via an HTML form POST, not a plain
 * redirect — a GET with the same fields on the query string would expose the
 * signed hash and other fields in server logs and browser history for no
 * reason a real integration would accept.
 */
function redirectToGateway(url: string, fields: Record<string, string>): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = url;

  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
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
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-neutral-400">{hint}</span> : null}
    </label>
  );
}

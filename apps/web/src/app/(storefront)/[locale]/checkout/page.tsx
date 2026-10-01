'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import { BRAND, formatMoney, type Locale } from '@newax/shared';
import { Wizard, type WizardStep } from '@/components/common/wizard';
import { useCart } from '@/components/storefront/cart-provider';
import { useRouter } from '@/i18n/navigation';
import { trackEvent } from '@/lib/analytics-client';
import { request } from '@/lib/api-client';
import { getCustomerToken, updateGuestContact } from '@/lib/cart-client';
import { ROUTES } from '@/constants/routes';
import { STORAGE_KEYS } from '@/constants/storage';

interface PaymentMethod {
  key: string;
  labelEn: string;
  labelUr: string;
  descriptionEn: string;
  descriptionUr: string;
  fee: number;
  /** True for a third-party gift-card network (Giftkarta) — the code is collected AFTER the order exists, not here. */
  requiresCode: boolean;
}

/** What POST /orders hands back. Only the parts this page acts on. */
interface CheckoutResponse {
  number: string;
  payment?: {
    paymentId?: string;
    redirectUrl?: string;
    meta?: { fields?: Record<string, string> };
  };
}

/** What POST /promotions/preview hands back — see promotions-public.controller.ts. */
interface DiscountPreview {
  linePerUnitDiscounts: Record<string, number>;
  orderDiscount: number;
  shippingDiscount: number;
  applied: Array<{ discountId: string; name: string; type: string; amount: number }>;
}

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
    // Widened: the brand list is `as const`, so the first entry would
    // otherwise type this field as that one literal and reject every other
    // region the select offers.
    province: BRAND.locale.regions[0] as string,
    postalCode: '',
    note: '',
    // WO-8.5 — a guest who opts in gets abandoned-cart recovery on
    // WhatsApp/SMS, not just email; a signed-in customer's account already
    // covers this and never sees the checkbox.
    marketingConsent: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // architecture-patterns/157 — one key for the whole lifetime of this
  // "place an order" attempt: generated once, resent unchanged on every
  // retry (a declined-then-retried payment, a flaky network), so a resend
  // collapses to the SAME order instead of a second one. A fresh checkout
  // attempt only exists once this page remounts (new cart, new mount).
  const idempotencyKey = useRef<string | null>(null);
  if (idempotencyKey.current === null) idempotencyKey.current = crypto.randomUUID();

  // Phase 5 (WO-5.3/5.4/5.5): promo code, gift card and store credit — all
  // validated authoritatively at order placement; the promo preview here is
  // purely a live estimate using the SAME evaluator the real checkout uses
  // (House Rule 11), so it can never show a number the order disagrees with.
  const [promoCode, setPromoCode] = useState('');
  const [promoPreview, setPromoPreview] = useState<DiscountPreview | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [giftCardCode, setGiftCardCode] = useState('');
  const [giftCardAmount, setGiftCardAmount] = useState('');
  const [storeCreditAmount, setStoreCreditAmount] = useState('');
  const isSignedIn = Boolean(getCustomerToken());

  /**
   * WO-8.5 — stamps the guest's phone + consent onto the cart as soon as it
   * looks real, well before the order exists, so an abandoned cart is still
   * recoverable. Best-effort: a failure here must never block checkout, so
   * it's silently swallowed rather than surfaced as a form error.
   */
  function syncGuestContact(phone: string, marketingConsent: boolean): void {
    if (isSignedIn) return;
    if (phone.replace(/\D/g, '').length < 10) return;
    updateGuestContact(phone, marketingConsent, locale).catch(() => {});
  }

  // A third-party gift card network (Giftkarta et al. — PaymentProvider's own
  // `requiresCode`): the order already exists once we get here, PENDING on
  // this one payment, and this is the follow-up screen that redeems it —
  // never collected earlier, since the redemption itself is a real external
  // debit that must never run inside the order-creation transaction.
  const [pendingGiftCardPayment, setPendingGiftCardPayment] = useState<{ paymentId: string; orderNumber: string } | null>(null);
  const [networkGiftCardCode, setNetworkGiftCardCode] = useState('');
  const [redeemingNetworkCard, setRedeemingNetworkCard] = useState(false);
  const [networkGiftCardError, setNetworkGiftCardError] = useState<string | null>(null);

  async function redeemNetworkGiftCard() {
    if (!pendingGiftCardPayment || !networkGiftCardCode.trim()) return;
    setRedeemingNetworkCard(true);
    setNetworkGiftCardError(null);
    try {
      await request(`/payments/${pendingGiftCardPayment.paymentId}/redeem-gift-card`, {
        method: 'POST',
        body: { code: networkGiftCardCode.trim() },
        fallbackMessage: t('giftCardRedeemFailed'),
      });
      window.location.href = `/${locale}${ROUTES.storefront.order(pendingGiftCardPayment.orderNumber)}?placed=1`;
    } catch (cause) {
      setNetworkGiftCardError(cause instanceof Error ? cause.message : t('giftCardRedeemFailed'));
    } finally {
      setRedeemingNetworkCard(false);
    }
  }

  async function checkPromoCode() {
    if (!cart || !promoCode.trim()) return;
    setCheckingPromo(true);
    setPromoError(null);
    try {
      const preview = await request<DiscountPreview>('/promotions/preview', {
        method: 'POST',
        credentials: 'include',
        body: {
          lines: cart.items.map((line) => ({ id: line.id, productId: line.productId, unitPrice: line.unitPrice, quantity: line.quantity })),
          // Shipping is priced by delivery city at placement (see the
          // "shippingByCity" summary row below) — never estimated here, so a
          // FREE_SHIPPING code's rupee value only shows at the real total.
          shippingFee: 0,
          promoCode: promoCode.trim(),
        },
      });
      setPromoPreview(preview);
    } catch (cause) {
      setPromoPreview(null);
      setPromoError(cause instanceof Error ? cause.message : t('promoInvalid'));
    } finally {
      setCheckingPromo(false);
    }
  }

  useEffect(() => {
    void request<PaymentMethod[]>('/payments/methods')
      .then((loaded) => {
        setMethods(loaded);
        setMethod((current) => current || (loaded[0]?.key ?? ''));
      })
      // A checkout with no payment methods listed is broken anyway; failing
      // quietly here keeps the page usable for the cash-on-delivery default.
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
      // Through the shared client: it raises ApiError carrying a message that
      // is already fit to show, so this no longer joins a string[] by hand —
      // which is how the same validation failure came to read differently
      // here than everywhere else in the app.
      const payload = await request<CheckoutResponse>('/orders', {
        method: 'POST',
        credentials: 'include',
        query: { locale },
        headers: {
          'Idempotency-Key': idempotencyKey.current!,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        fallbackMessage: t('failed'),
        body: {
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
          promoCode: promoPreview ? promoCode.trim() : undefined,
          giftCardCode: giftCardCode.trim() || undefined,
          giftCardAmount: giftCardCode.trim() && giftCardAmount ? Math.round(Number(giftCardAmount) * 100) : undefined,
          storeCreditAmount: isSignedIn && storeCreditAmount ? Math.round(Number(storeCreditAmount) * 100) : undefined,
        },
      });

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

      const chosenMethod = methods.find((candidate) => candidate.key === method);
      if (chosenMethod?.requiresCode && payload.payment?.paymentId) {
        // Giftkarta et al.: the order exists, but this one payment stays
        // PENDING until the code below redeems it — no full navigation yet,
        // so a mistyped code can be corrected without losing the order.
        setPendingGiftCardPayment({ paymentId: payload.payment.paymentId, orderNumber: payload.number });
        setBusy(false);
        return;
      }

      // Cash on delivery / bank transfer: nothing more to collect now. A
      // full navigation, so the cart provider reloads and shows it emptied.
      window.location.href = `/${locale}${ROUTES.storefront.order(payload.number)}?placed=1`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('failed'));
      setBusy(false);
    }
  }

  if (pendingGiftCardPayment) {
    return (
      <div className="container-page pt-16 font-display md:pb-16">
        <h1 className="text-2xl font-semibold text-neutral-900">{t('giftCardRedeemTitle')}</h1>
        <p className="mt-2 max-w-md text-sm text-neutral-500">
          {t('giftCardRedeemBody', { orderNumber: pendingGiftCardPayment.orderNumber })}
        </p>

        <section className="card mt-6 max-w-md p-4 sm:p-6">
          <Field label={t('giftCardCode')}>
            <input
              value={networkGiftCardCode}
              onChange={(event) => setNetworkGiftCardCode(event.target.value)}
              placeholder="XXXX-XXXX-XXXX"
              className="field-input"
            />
          </Field>
          {networkGiftCardError ? (
            <p role="alert" className="notice notice-error mt-3 whitespace-pre-line">
              {networkGiftCardError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void redeemNetworkGiftCard()}
            disabled={redeemingNetworkCard || !networkGiftCardCode.trim()}
            className="btn-primary mt-4 w-full"
          >
            {redeemingNetworkCard ? t('checking') : t('giftCardRedeemSubmit')}
          </button>
        </section>

        <button
          type="button"
          onClick={() => router.push(ROUTES.storefront.order(pendingGiftCardPayment.orderNumber))}
          className="btn-text mt-4 text-sm"
        >
          {t('giftCardRedeemLater')}
        </button>
      </div>
    );
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
      <div className="container-page pt-16 font-display md:pb-16">
        <h1 className="text-2xl font-semibold text-neutral-900">{t('title')}</h1>
        <ul className="mt-4 space-y-1 rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
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
                onBlur={(event) => syncGuestContact(event.target.value, form.marketingConsent)}
                required
                inputMode="tel"
                autoComplete="tel"
                placeholder="03001234567"
                className="field-input"
              />
            </Field>

            {!isSignedIn && (
              <div className="sm:col-span-2">
                <label className="flex items-start gap-2 text-sm text-neutral-900/70">
                  <input
                    type="checkbox"
                    checked={form.marketingConsent}
                    onChange={(event) => {
                      const marketingConsent = event.target.checked;
                      setForm({ ...form, marketingConsent });
                      syncGuestContact(form.phone, marketingConsent);
                    }}
                    className="field-check mt-0.5"
                  />
                  {t('marketingConsent')}
                </label>
              </div>
            )}

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
                {BRAND.locale.regions.map((province) => (
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
                  'flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-colors duration-normal focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2',
                  option.key === method
                    ? 'border-neutral-900 bg-neutral-900/[0.03]'
                    : 'border-neutral-100 hover:border-neutral-300',
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

          <section className="card space-y-4 p-4 sm:p-6">
            <h2 className="text-base font-semibold text-neutral-900">{t('offersTitle')}</h2>

            <Field label={t('promoCode')}>
              <div className="flex gap-2">
                <input
                  value={promoCode}
                  onChange={(event) => {
                    setPromoCode(event.target.value);
                    setPromoPreview(null);
                    setPromoError(null);
                  }}
                  className="field-input flex-1"
                  placeholder="EID2026"
                />
                <button
                  type="button"
                  onClick={() => void checkPromoCode()}
                  disabled={checkingPromo || !promoCode.trim()}
                  className="btn-secondary shrink-0"
                >
                  {checkingPromo ? t('checking') : t('apply')}
                </button>
              </div>
              {promoError ? <p className="mt-1.5 text-xs text-red-600">{promoError}</p> : null}
              {promoPreview && promoPreview.applied.length > 0 ? (
                <p className="mt-1.5 text-xs text-feedback-positive">
                  {t('promoApplied', { name: promoPreview.applied[0]!.name })}
                </p>
              ) : null}
            </Field>

            <Field label={t('giftCardCode')} hint={t('giftCardHint')}>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={giftCardCode}
                  onChange={(event) => setGiftCardCode(event.target.value)}
                  className="field-input"
                  placeholder="XXXX-XXXX-XXXX"
                />
                <input
                  type="number"
                  min={1}
                  value={giftCardAmount}
                  onChange={(event) => setGiftCardAmount(event.target.value)}
                  className="field-input"
                  placeholder={t('amountRs')}
                />
              </div>
            </Field>

            {isSignedIn ? (
              <Field label={t('storeCredit')}>
                <input
                  type="number"
                  min={1}
                  value={storeCreditAmount}
                  onChange={(event) => setStoreCreditAmount(event.target.value)}
                  className="field-input"
                  placeholder={t('amountRs')}
                />
              </Field>
            ) : null}
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

            <dl className="mt-4 space-y-2 border-t border-neutral-100 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t('goods')}</dt>
                <dd className="text-neutral-900">{formatMoney(cart.totals.grandTotal, locale)}</dd>
              </div>
              {promoPreview && promoPreview.applied.length > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-neutral-500">{t('discount')}</dt>
                  <dd className="text-feedback-positive">
                    -{formatMoney(
                      promoPreview.orderDiscount +
                        Object.entries(promoPreview.linePerUnitDiscounts).reduce((sum, [lineId, perUnit]) => {
                          const line = cart.items.find((candidate) => candidate.id === lineId);
                          return sum + perUnit * (line?.quantity ?? 0);
                        }, 0),
                      locale,
                    )}
                  </dd>
                </div>
              ) : null}
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
    <div className="container-page pt-6 font-display sm:pt-8 md:pb-8">
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
          accentClassName="bg-inverse text-on-inverse"
          backLabel={t('back')}
          nextLabel={t('next')}
          error={
            error ? (
              <p
                role="alert"
                className="notice notice-error whitespace-pre-line"
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

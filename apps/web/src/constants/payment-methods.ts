/**
 * How a payment provider's key is written for staff.
 *
 * The API's `/payments/methods` is the customer-facing source and carries
 * translated labels; this map is only for the back office, which is
 * English-only and reads the provider key off an order it already has rather
 * than fetching the method list to render one table cell.
 *
 * It exists because the orders table was printing the raw key — a column
 * reading `bank_transfer` with the underscore showing. Humanising it
 * generically is not enough on its own: `cod` has to come out as `COD`, not
 * `Cod`, which is exactly the kind of exception that gets lost when the
 * transform is written inline at the call site.
 */
export const PAYMENT_PROVIDER_LABELS: Record<string, string> = {
  cod: 'COD',
  bank_transfer: 'Bank transfer',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  card: 'Card',
};

/** Falls back to humanising the key, so a provider added later still reads. */
export function paymentProviderLabel(provider: string): string {
  return (
    PAYMENT_PROVIDER_LABELS[provider] ??
    provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase().replace(/_/g, ' ')
  );
}

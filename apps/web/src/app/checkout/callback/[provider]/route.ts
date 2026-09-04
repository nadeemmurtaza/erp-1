import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE } from '@yaseen/shared';
import { API_URL } from '@/lib/api';

/**
 * Where JazzCash/Easypaisa post (or redirect) the customer back to after
 * hosted checkout — EASYPAISA_RETURN_URL / JAZZCASH_RETURN_URL on the API
 * point here. Deliberately outside the [locale] segment (see middleware.ts):
 * the gateways are configured with one fixed URL, not one per language.
 *
 * This route does not verify the payment itself — it has no HMAC secret and
 * shouldn't need one. It forwards whatever the gateway sent to the API's
 * already-verified POST /payments/callback/:provider, then sends the
 * customer's browser on to their order page with the outcome. The API is the
 * only thing that ever writes a Payment/Order row from this data.
 */
async function handle(request: NextRequest, provider: string): Promise<NextResponse> {
  let payload: Record<string, string> = {};

  if (request.method === 'GET') {
    payload = Object.fromEntries(request.nextUrl.searchParams);
  } else {
    const contentType = request.headers.get('content-type') ?? '';
    try {
      if (contentType.includes('application/json')) {
        payload = (await request.json()) as Record<string, string>;
      } else {
        const form = await request.formData();
        payload = Object.fromEntries(
          [...form.entries()].map(([key, value]) => [key, String(value)]),
        );
      }
    } catch {
      payload = {};
    }
  }

  // Falls back to the checkout page itself — reachable if the gateway sent
  // something this route couldn't parse at all, or the API was unreachable.
  let destination = `/${DEFAULT_LOCALE}/checkout?payment=error`;

  try {
    const response = await fetch(`${API_URL}/payments/callback/${provider}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = (await response.json().catch(() => undefined)) as
      | { orderNumber?: string; status?: string }
      | undefined;

    if (result?.orderNumber) {
      const outcome = result.status === 'PAID' ? 'success' : 'failed';
      destination = `/${DEFAULT_LOCALE}/orders/${result.orderNumber}?payment=${outcome}`;
    }
  } catch {
    // destination stays the generic fallback above
  }

  // 303: the gateway's request here was a POST, but the browser's next hop
  // is a plain page load, not a resubmission of the payment fields.
  return NextResponse.redirect(new URL(destination, request.url), 303);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  return handle(request, (await params).provider);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  return handle(request, (await params).provider);
}

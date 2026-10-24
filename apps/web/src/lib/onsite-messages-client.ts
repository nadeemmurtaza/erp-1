'use client';

import type { ActiveOnsiteMessage } from '@newax/shared';
import { request } from './api-client';
import { getCustomerToken } from './cart-client';

/**
 * WO-8.6. Client-side (not apiFetch/server component): the active set
 * depends on the current path client-side navigation lands on, and on
 * whether a signed-in customer's Contact is in a targeted segment — neither
 * is known at server-render time for a client-navigated route.
 */
export function fetchActiveOnsiteMessages(path: string, locale: string): Promise<ActiveOnsiteMessage[]> {
  const token = getCustomerToken();
  return request<ActiveOnsiteMessage[]>('/onsite-messages/active', {
    query: { path, locale },
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export function subscribeToNewsletter(email: string, locale: string): Promise<void> {
  return request<void>('/onsite-messages/newsletter', { method: 'POST', body: { email, locale } });
}

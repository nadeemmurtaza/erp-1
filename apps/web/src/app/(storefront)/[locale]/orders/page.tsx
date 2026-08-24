'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { formatMoney, type Locale } from '@yaseen/shared';
import { Link, usePathname } from '@/i18n/navigation';
import { useCustomerSession } from '@/components/storefront/customer-session';
import { customerFetch } from '@/lib/customer-client';
import type { CustomerOrderSummary, PaginatedResult } from '@/lib/api-types';

export default function OrderHistoryPage() {
  const { user, isLoading } = useCustomerSession();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale() as Locale;

  const [orders, setOrders] = useState<PaginatedResult<CustomerOrderSummary> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, user, router, pathname]);

  const load = useCallback(async () => {
    try {
      setOrders(
        await customerFetch<PaginatedResult<CustomerOrderSummary>>('/orders/mine', {
          query: { page, pageSize: 10 },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your orders');
    }
  }, [page]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (isLoading || !user) {
    return (
      <div className="container-page flex min-h-[50vh] items-center justify-center text-sm text-ink/50">
        Loading…
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <h1 className="mb-1 text-2xl font-semibold text-brand-700">My Orders</h1>
      <p className="mb-6 text-sm text-ink/60">Every order placed with this account.</p>

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {!orders ? (
        <p className="text-sm text-ink/50">Loading…</p>
      ) : orders.data.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink/50">
          No orders yet.{' '}
          <Link href="/shop" className="font-medium text-brand-700 hover:underline">
            Start shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.data.map((order) => (
            <Link
              key={order.number}
              href={`/orders/${order.number}`}
              className="card block p-4 transition hover:bg-sand-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-ink">{order.number}</p>
                  <p className="text-xs text-ink/50">
                    {new Date(order.placedAt).toLocaleDateString('en-PK', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <div className="text-end">
                  <p className="text-sm font-medium text-ink">{formatMoney(order.grandTotal, locale)}</p>
                  <p className="text-xs uppercase tracking-wide text-ink/50">{order.status}</p>
                </div>
              </div>
              <p className="mt-2 text-sm text-ink/60">
                {order.items.map((item) => item.nameEn).join(', ')}
              </p>
            </Link>
          ))}
        </div>
      )}

      {orders && orders.meta.totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-between text-sm text-ink/60">
          <span>
            Page {orders.meta.page} of {orders.meta.totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!orders.meta.hasPrevious}
              onClick={() => setPage((p) => p - 1)}
              className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!orders.meta.hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

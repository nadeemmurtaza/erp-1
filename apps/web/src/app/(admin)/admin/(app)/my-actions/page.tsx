'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader, EmptyState, Loading } from '@/components/ui';
import { adminFetch } from '@/lib/admin-client';
import type { ActionHubResponse } from '@/types/api';

/**
 * The manager action hub's full screen
 * (admin-platform/44-manager-action-hub.md WO-44.4) — the overflow case
 * for the dashboard widget's preview. This screen only reads; every row's
 * `href` opens the real screen that owns that action.
 */
export default function MyActionsPage() {
  const [data, setData] = useState<ActionHubResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch<ActionHubResponse>('/admin/action-hub')
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your actions.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageHeader title="My actions" description="Everything currently waiting on your signature, from every registered source." />

      {error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : !data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <EmptyState title="Nothing waiting." description="Everything is up to date." />
      ) : (
        <>
          {data.unavailableKinds.length > 0 ? (
            <p className="notice notice-info mb-4">
              Temporarily unavailable: {data.unavailableKinds.join(', ')}. Other items below are current.
            </p>
          ) : null}
          <ul className="flex flex-col divide-y divide-neutral-100">
            {data.items.map((item) => (
              <li key={item.id} className="py-3">
                <Link href={item.href} className="flex items-baseline justify-between gap-3 hover:underline">
                  <span className="min-w-0 truncate text-sm text-neutral-900">{item.summary}</span>
                  {item.dueBy ? (
                    <span className="shrink-0 text-xs tabular-nums text-neutral-900/60">
                      {new Date(item.dueBy).toLocaleDateString()}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

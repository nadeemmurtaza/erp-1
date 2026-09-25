'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Section } from '@/components/ui';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import type { ActionHubResponse } from '@/types/api';

const PREVIEW_COUNT = 5;

/**
 * The manager action hub's dashboard widget
 * (admin-platform/44-manager-action-hub.md WO-44.4) — a new card on the
 * existing dashboard, not a new page shell. The hub never approves or
 * rejects anything itself: every row's own `href` opens the real screen
 * that already owns that write path.
 */
export function ActionHubWidget() {
  const [data, setData] = useState<ActionHubResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch<ActionHubResponse>('/admin/action-hub')
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch(() => {
        // Not fatal — the rest of the dashboard still renders.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data || data.items.length === 0) return null;

  const preview = data.items.slice(0, PREVIEW_COUNT);
  const overflow = data.items.length - preview.length;

  return (
    <Section title="Needs your signature">
      <ul className="flex flex-col divide-y divide-neutral-100">
        {preview.map((item) => (
          <li key={item.id} className="py-2">
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

      {data.unavailableKinds.length > 0 ? (
        <p className="mt-2 text-xs text-neutral-900/60">Some sources are temporarily unavailable.</p>
      ) : null}

      {overflow > 0 ? (
        <Link href={ROUTES.admin.myActions} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
          {overflow} more — view all
        </Link>
      ) : null}
    </Section>
  );
}

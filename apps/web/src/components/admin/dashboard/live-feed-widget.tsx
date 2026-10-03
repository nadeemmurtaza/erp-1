'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { formatDateTime } from '@newax/shared';
import { Section } from '@/components/ui';
import { cn } from '@/utils/cn';
import { adminFetch } from '@/lib/admin-client';
import type { FeedEntry, FeedResponse } from '@/types/api';

const POLL_INTERVAL_MS = 8000;
const DISPLAY_COUNT = 10;

/**
 * The live operational feed's dashboard widget
 * (analytics-reporting/58-live-operational-feed.md WO-58.3) — short-interval
 * client polling over `GET /admin/feed`, reading only entries newer than the
 * last-seen cursor (`sinceId`). This is honestly a poll, not a push channel
 * (the doc's own §1): a manager glancing at recent activity, not a ticker.
 */
export function LiveFeedWidget() {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [unavailableKinds, setUnavailableKinds] = useState<string[]>([]);
  const [failing, setFailing] = useState(false);
  // Entries that arrived on a later poll than the first: only those are news. The first poll is the page's opening state.
  const [arrived, setArrived] = useState<ReadonlySet<string>>(() => new Set());
  const sinceIdRef = useRef<string | null>(null);
  const polledRef = useRef(false);

  const poll = useCallback(async () => {
    try {
      const isFirstPoll = !polledRef.current;
      const response = await adminFetch<FeedResponse>('/admin/feed', {
        query: sinceIdRef.current ? { sinceId: sinceIdRef.current } : {},
      });
      polledRef.current = true;
      setFailing(false);
      setUnavailableKinds(response.unavailableKinds);
      if (response.items.length > 0) {
        sinceIdRef.current = response.items[0]!.id; // items arrive newest first
        // Only the ids still on screen matter, so the set never outgrows the list it describes.
        if (!isFirstPoll) {
          setArrived((prev) => new Set([...response.items.map((item) => item.id), ...prev].slice(0, DISPLAY_COUNT)));
        }
        setEntries((prev) => [...response.items, ...prev].slice(0, DISPLAY_COUNT));
      }
    } catch {
      // A poll that fails shows its own retry state, never a silent freeze
      // that looks like genuinely quiet operations — the next interval tries again.
      setFailing(true);
    }
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  if (entries.length === 0 && !failing) return null;

  return (
    <Section title="Recent activity">
      {failing ? (
        <p className="notice notice-error" role="alert">
          Unable to refresh — retrying…
        </p>
      ) : null}

      {entries.length > 0 ? (
        <ul className="flex flex-col divide-y divide-neutral-100">
          {entries.map((entry) => (
            <li
              key={entry.id}
              // A new entry settles into place and one highlight crosses it, once; entries already on the page stay still.
              className={cn('py-2', arrived.has(entry.id) && 'sheen animate-arrive')}
              data-fresh={arrived.has(entry.id) ? 'true' : undefined}
            >
              <Link href={entry.href} className="flex items-baseline justify-between gap-3 hover:underline">
                <span className="min-w-0 truncate text-sm text-neutral-900">{entry.summary}</span>
                <span className="shrink-0 text-xs tabular-nums text-neutral-900/60">{formatDateTime(entry.occurredAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {unavailableKinds.length > 0 ? (
        <p className="mt-2 text-xs text-neutral-900/60">Some sources are temporarily unavailable.</p>
      ) : null}
    </Section>
  );
}

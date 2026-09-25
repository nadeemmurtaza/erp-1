'use client';

import { useEffect, useState } from 'react';
import { Section, Loading } from '@/components/ui';
import { ComparisonChart, type ComparisonBucketPoint } from '@/components/admin/charts';
import { adminFetch } from '@/lib/admin-client';

interface ComparisonResponse {
  buckets: ComparisonBucketPoint[];
  financeEnabled: boolean;
}

/**
 * The one comparative chart the owner asked for by name (Phase 10's own
 * "Why"), filling the empty slot WO-B.5 left in the card-grid layout.
 * `GET /admin/analytics/comparison` already exists (WO-B.5, built against
 * the pre-registry "live idiom" per ADR-019) — this only wires it into the
 * rebuilt page.
 */
export function ComparisonPanel({ days }: { days: number }) {
  const [data, setData] = useState<ComparisonResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    adminFetch<ComparisonResponse>('/admin/analytics/comparison', { query: { days, bucket: 'day' } })
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch(() => {
        // Not fatal — the rest of the dashboard still renders.
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (!data) return <Loading />;

  return (
    <Section title="Sales, purchases and expenses">
      <ComparisonChart buckets={data.buckets} />
    </Section>
  );
}

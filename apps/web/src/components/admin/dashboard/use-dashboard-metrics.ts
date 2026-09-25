'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import type { DashboardCardsResponse } from '@/types/api';
import { DASHBOARD_GROUPS } from './card-registry';
import type { MetricCardData } from './metric-card';

const SPARKLINE_SERIES = ['revenue', 'orders', 'expenses', 'purchases', 'units_produced', 'new_customers'] as const;

export interface DashboardMetrics {
  metricsByKey: Record<string, MetricCardData>;
  seriesByKey: Record<string, readonly number[]>;
  loading: boolean;
  error: string | null;
  generatedAt: string | null;
}

/**
 * The dashboard's ONE network request per range change (WO-A.4's own
 * acceptance criterion). Every group and every sparkline series is
 * requested in the same call regardless of which group rows are currently
 * expanded — collapsing a row hides its cards, it never changes what was
 * fetched, so re-expanding one is instant rather than a second request.
 */
export function useDashboardMetrics(days: number): DashboardMetrics {
  const [state, setState] = useState<DashboardMetrics>({
    metricsByKey: {},
    seriesByKey: {},
    loading: true,
    error: null,
    generatedAt: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    adminFetch<DashboardCardsResponse>('/admin/analytics/cards', {
      query: {
        days,
        groups: DASHBOARD_GROUPS.map((group) => group.key).join(','),
        series: SPARKLINE_SERIES.join(','),
        bucket: 'day',
      },
    })
      .then((response) => {
        if (cancelled) return;
        const seriesByKey: Record<string, readonly number[]> = {};
        for (const [key, points] of Object.entries(response.series)) {
          seriesByKey[key] = points.map((point) => point.v);
        }
        setState({ metricsByKey: response.metrics, seriesByKey, loading: false, error: null, generatedAt: response.generatedAt });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Could not load the dashboard.',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [days]);

  return state;
}

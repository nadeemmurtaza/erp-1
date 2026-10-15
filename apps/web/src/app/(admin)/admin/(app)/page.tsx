'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';
import { useEnabledModules } from '@/components/admin/deployment-modules';
import { useFilterParam, useSetFilterParam } from '@/components/ui/filter-bar';
import { RangePicker, DASHBOARD_RANGES } from '@/components/admin/range-picker';
import { ROUTES } from '@/constants/routes';
import { DASHBOARD_GROUPS, cardsFor, type DashboardCard } from '@/components/admin/dashboard/card-registry';
import { CardGroup } from '@/components/admin/dashboard/card-group';
import { RevealScope } from '@/components/ui/reveal-scope';
import { NeedsAttentionStrip } from '@/components/admin/dashboard/needs-attention-strip';
import { ActionHubWidget } from '@/components/admin/dashboard/action-hub-widget';
import { LiveFeedWidget } from '@/components/admin/dashboard/live-feed-widget';
import { GrossProfitTodayWidget } from '@/components/admin/dashboard/gross-profit-today-widget';
import { ComparisonPanel } from '@/components/admin/dashboard/comparison-panel';
import { useDashboardMetrics } from '@/components/admin/dashboard/use-dashboard-metrics';

/**
 * The dashboard, rebuilt as a grouped card grid driven entirely by data
 * (10-admin-dashboard.md WO-A.4). It replaces a 566-line page with inline
 * `Stat`/`BarList`/`Mini` helpers and one ad hoc fetch per metric — every
 * card here is a `card-registry.ts` object, and the whole grid comes from
 * ONE request to `GET /admin/analytics/cards` per range change.
 *
 * "Collapsed groups" layout (the owner's own decision): the needs-attention
 * strip stays first, then nine group rows, each closed by default showing
 * only its headline figure, expanding on click — the shape that lets a
 * ~55-card dashboard still read as "a few features" (Law 3) without
 * deleting a single card, and puts overview before detail (Law 7).
 */
export default function AdminDashboardPage() {
  const session = useAdminSession();
  const enabledModules = useEnabledModules();

  const daysParam = useFilterParam('days', '30');
  const setDaysParam = useSetFilterParam('days');
  const days = Math.min(Math.max(Number(daysParam) || 30, 7), 365);

  const { metricsByKey, seriesByKey, loading, error } = useDashboardMetrics(days);
  const visibleCards = cardsFor(enabledModules ?? []);

  function canSee(card: DashboardCard): boolean {
    return !card.permissions || card.permissions.length === 0 || card.permissions.some((key) => session.can(key));
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="What needs doing right now, and how the shop is performing."
        action={
          <Link href={ROUTES.admin.productNew} className="btn-primary">
            Add product
          </Link>
        }
      />

      <NeedsAttentionStrip />
      <ActionHubWidget />
      <LiveFeedWidget />
      <GrossProfitTodayWidget />

      <div className="mb-4 flex justify-end">
        <RangePicker
          value={days}
          onChange={(value) => setDaysParam(String(value))}
          ranges={DASHBOARD_RANGES}
          label="Dashboard range"
        />
      </div>

      {error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : null}

      <RevealScope className="flex flex-col gap-3">
        {DASHBOARD_GROUPS.map((group) => {
          const groupCards = visibleCards.filter((card) => card.group === group.key);
          if (groupCards.length === 0) return null;
          return (
            <CardGroup
              key={group.key}
              groupKey={group.key}
              label={group.label}
              icon={group.icon}
              href={group.href}
              cards={groupCards}
              metricsByKey={loading ? {} : metricsByKey}
              seriesByKey={seriesByKey}
              days={days}
              canSee={canSee}
            />
          );
        })}
      </RevealScope>

      <div className="mt-4">
        <ComparisonPanel days={days} />
      </div>
    </>
  );
}

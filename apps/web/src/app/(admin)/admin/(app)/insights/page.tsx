'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatMoney, formatNumber } from '@newax/shared';
import { DonutChart } from '@/components/admin/donut-chart';
import { GaugeChart } from '@/components/admin/gauge-chart';
import { FunnelChart } from '@/components/admin/funnel-chart';
import { adminFetch } from '@/lib/admin-client';
import { RangePicker, type RangeDays } from '@/components/admin/range-picker';
import type { MonthlyTarget, VisitorAnalytics } from '@/types/api';
import { EmptyState, Loading, PageHeader, Section, Tabs } from '@/components/ui';

/**
 * Where the analytics live.
 *
 * These five views — monthly target, best sellers, top categories, the
 * conversion funnel and traffic sources — were all on the dashboard, which is
 * how it ended up with twelve cards and four charts competing for the same
 * glance. None of them answer "what needs attention?"; they answer "how are we
 * doing?", which is a different question asked at a different time.
 *
 * They are tabs rather than one long page because they are four separate
 * questions, and stacking them is what the dashboard was already doing.
 */
interface DashboardSlice {
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  monthlyTarget: MonthlyTarget;
}

interface ExtendedSlice {
  revenueByCategory: Array<{ category: string; revenue: number }>;
}

export default function InsightsPage() {
  const [days, setDays] = useState<RangeDays>(30);
  const [data, setData] = useState<DashboardSlice | null>(null);
  const [extended, setExtended] = useState<ExtendedSlice | null>(null);
  const [visitors, setVisitors] = useState<VisitorAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The target is the one editable thing on this page, so it keeps its own
  // small bit of state rather than a form page of its own.
  const [targetDraft, setTargetDraft] = useState<string | null>(null);
  const [targetSaving, setTargetSaving] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [dashboard, extendedData, visitorData] = await Promise.all([
        adminFetch<DashboardSlice>('/admin/analytics/dashboard', { query: { days } }),
        adminFetch<ExtendedSlice>('/admin/analytics/extended', { query: { days } }),
        adminFetch<VisitorAnalytics>('/admin/analytics/visitors', { query: { days } }),
      ]);
      setData(dashboard);
      setExtended(extendedData);
      setVisitors(visitorData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load insights');
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveTarget(event: React.FormEvent) {
    event.preventDefault();
    setTargetSaving(true);
    setTargetError(null);
    try {
      // Rupees on screen, paisa in the API — the same boundary the garments
      // page's stitching-fee field crosses.
      const targetAmount = Math.round(Number(targetDraft || 0) * 100);
      const monthlyTarget = await adminFetch<MonthlyTarget>('/admin/analytics/monthly-target', {
        method: 'PATCH',
        body: { targetAmount },
      });
      setData((current) => (current ? { ...current, monthlyTarget } : current));
      setTargetDraft(null);
    } catch (cause) {
      setTargetError(cause instanceof Error ? cause.message : 'Could not save the target');
    } finally {
      setTargetSaving(false);
    }
  }

  const rangePicker = <RangePicker value={days} onChange={setDays} />;

  if (error) {
    return (
      <>
        <PageHeader title="Insights" description="How the shop is performing." />
        <p role="alert" className="text-sm text-feedback-negative">
          {error}
        </p>
      </>
    );
  }

  if (!data || !extended || !visitors) {
    return (
      <>
        <PageHeader title="Insights" description="How the shop is performing." />
        <Loading />
      </>
    );
  }


  return (
    <>
      <PageHeader
        title="Insights"
        description="How the shop is performing. For what needs doing now, see the dashboard."
        action={rangePicker}
      />

      <Tabs
        label="Insight areas"
        items={[
          {
            key: 'sales',
            label: 'Sales',
            content: (
              <>
                <Section title={`Best sellers · last ${days} days`}>
                  {data.topProducts.length === 0 ? (
                    <EmptyState
                      title="No sales in this window"
                      description="Try a longer range, or check back once orders come in."
                    />
                  ) : (
                    <ol className="divide-y divide-neutral-100">
                      {data.topProducts.map((product) => (
                        <li
                          key={product.name}
                          className="flex items-baseline justify-between gap-4 py-2.5 text-sm"
                        >
                          <span className="min-w-0 truncate text-neutral-900">{product.name}</span>
                          <span className="shrink-0 text-neutral-900/60">
                            {product.quantity} sold · {formatMoney(product.revenue)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Section>

                <Section
                  title="Monthly target"
                  description={`${formatMoney(data.monthlyTarget.achievedAmount)} of ${formatMoney(data.monthlyTarget.targetAmount)} this month.`}
                  action={
                    targetDraft === null ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          setTargetDraft(String(data.monthlyTarget.targetAmount / 100))
                        }
                      >
                        Edit target
                      </button>
                    ) : null
                  }
                >
                  <div className="max-w-xs">
                    <GaugeChart percent={data.monthlyTarget.percent} />
                  </div>

                  {targetDraft !== null ? (
                    <form onSubmit={saveTarget} className="mt-4 flex max-w-xs flex-wrap gap-2">
                      <label className="flex-1">
                        <span className="field-label">Target for this month</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={targetDraft}
                          onChange={(event) => setTargetDraft(event.target.value)}
                          className="field-input"
                          // eslint-disable-next-line jsx-a11y/no-autofocus -- the field appears only after the user clicks "edit target"; focusing what they just asked for is the expected behaviour, not a page-load focus steal.
                          autoFocus
                        />
                      </label>
                      <div className="flex items-end gap-2">
                        <button type="submit" disabled={targetSaving} className="btn-primary">
                          {targetSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => setTargetDraft(null)}
                        >
                          Cancel
                        </button>
                      </div>
                      {targetError ? (
                        <p role="alert" className="w-full text-sm text-red-700">
                          {targetError}
                        </p>
                      ) : null}
                    </form>
                  ) : null}
                </Section>
              </>
            ),
          },
          {
            key: 'products',
            label: 'Products',
            content: (
              <Section title={`Revenue by category · last ${days} days`}>
                {extended.revenueByCategory.length === 0 ? (
                  <EmptyState title="No category revenue in this window" />
                ) : (
                  <div className="max-w-md">
                    <DonutChart
                      items={extended.revenueByCategory.map((row) => ({
                        label: row.category,
                        value: row.revenue,
                      }))}
                      valueFormatter={formatMoney}
                    />
                  </div>
                )}
              </Section>
            ),
          },
          {
            key: 'traffic',
            label: 'Traffic',
            content: (
              <>
                <Section
                  title={`Conversion funnel · last ${days} days`}
                  description="Where visitors stop on the way to an order."
                >
                  <FunnelChart
                    stages={[
                      { label: 'Product views', value: visitors.funnel.productViews },
                      { label: 'Added to cart', value: visitors.funnel.addToCart },
                      { label: 'Checkout started', value: visitors.funnel.checkoutStarted },
                      { label: 'Purchases completed', value: visitors.funnel.purchasesCompleted },
                    ]}
                  />
                </Section>

                <Section title={`Traffic sources · last ${days} days`}>
                  {visitors.trafficSources.length === 0 ? (
                    <EmptyState title="No page views in this window" />
                  ) : (
                    <ul className="divide-y divide-neutral-100">
                      {visitors.trafficSources.map((row) => (
                        <li
                          key={row.source}
                          className="flex items-baseline justify-between gap-4 py-2.5 text-sm"
                        >
                          <span className="text-neutral-900">{row.source}</span>
                          <span className="text-neutral-900/60">
                            {formatNumber(row.count)} · {row.percent}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </>
            ),
          },
        ]}
      />
    </>
  );
}

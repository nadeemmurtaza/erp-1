'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader, EmptyState, Loading } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';
import { adminFetch } from '@/lib/admin-client';
import { useFilterParam, useSetFilterParam } from '@/components/ui/filter-bar';
import { RangePicker } from '@/components/admin/range-picker';
import { ROUTES } from '@/constants/routes';
import { DASHBOARD_GROUPS } from '@/components/admin/dashboard/card-registry';
import { reportFor, type AnalyticsReport } from './report-registry';
import { KpisBlock } from './blocks/kpis-block';
import { TimeSeriesBlock } from './blocks/timeseries-block';
import { ShareBlock } from './blocks/share-block';
import { RankingBlock } from './blocks/ranking-block';
import { TableBlock } from './blocks/table-block';
import { FunnelBlock } from './blocks/funnel-block';
import { GaugeBlock } from './blocks/gauge-block';
import { DynamicTimeSeriesBlock } from './blocks/dynamic-timeseries-block';

/** Walks a report's own `parent` chain up to its group index, for the breadcrumb — the report-registry's own tree (D3), independent of the sidebar's nav tree. */
function breadcrumbFor(report: AnalyticsReport): Array<{ label: string; href: string }> {
  const group = DASHBOARD_GROUPS.find((g) => g.key === report.group);
  const trail: Array<{ label: string; href: string }> = [{ label: 'Analytics', href: ROUTES.admin.analytics }];
  if (group) trail.push({ label: group.label, href: ROUTES.admin.analyticsReport(report.group) });

  const ancestors: AnalyticsReport[] = [];
  let current: AnalyticsReport | undefined = report.parent ? reportFor(report.parent) : undefined;
  while (current) {
    ancestors.unshift(current);
    current = current.parent ? reportFor(current.parent) : undefined;
  }
  for (const ancestor of ancestors) {
    trail.push({ label: ancestor.title, href: ROUTES.admin.analyticsReport(ancestor.slug) });
  }
  return trail;
}

/**
 * The one detail-page shell every report renders through (D3) — a report is
 * a config object; this is the only component that turns one into a page.
 */
export function AnalyticsDetailPage({ report }: { report: AnalyticsReport }) {
  const session = useAdminSession();
  const canSee = report.permissions.length === 0 || report.permissions.some((key) => session.can(key));

  const daysParam = useFilterParam('days', '30');
  const setDaysParam = useSetFilterParam('days');
  const days = Math.min(Math.max(Number(daysParam) || 30, 7), 365);
  const ranges = report.ranges ?? [7, 30, 90, 365];

  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canSee) return;
    let cancelled = false;
    setData(null);
    setError(null);
    adminFetch<unknown>(report.endpoint, { query: { days } })
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this report.');
      });
    return () => {
      cancelled = true;
    };
  }, [report.endpoint, days, canSee]);

  const trail = breadcrumbFor(report);
  const context = (
    <nav aria-label="Breadcrumb">
      {trail.map((crumb, index) => (
        <span key={crumb.href}>
          {index > 0 ? <span aria-hidden="true"> / </span> : null}
          {index === trail.length - 1 ? crumb.label : <Link href={crumb.href}>{crumb.label}</Link>}
        </span>
      ))}
    </nav>
  );

  if (!canSee) {
    return (
      <>
        <PageHeader title={report.title} context={context} />
        <EmptyState
          title="You do not have permission to view this report."
          description="Ask an administrator for access if you need it."
          action={
            <Link href={ROUTES.admin.analytics} className="btn-secondary">
              Back to Analytics
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={report.title}
        description={report.description}
        context={context}
        action={<RangePicker value={days} onChange={(value) => setDaysParam(String(value))} ranges={ranges} label={`${report.title} range`} />}
      />

      {error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : !data ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-6">
          {report.blocks.map((block, index) => {
            switch (block.kind) {
              case 'kpis':
                return <KpisBlock key={index} config={block} data={data} />;
              case 'timeseries':
                return <TimeSeriesBlock key={index} config={block} data={data} />;
              case 'share':
                return <ShareBlock key={index} config={block} data={data} />;
              case 'ranking':
                return <RankingBlock key={index} config={block} data={data} />;
              case 'table':
                return <TableBlock key={index} config={block} data={data} />;
              case 'funnel':
                return <FunnelBlock key={index} config={block} data={data} />;
              case 'gauge':
                return <GaugeBlock key={index} config={block} data={data} />;
              case 'dynamic-timeseries':
                return <DynamicTimeSeriesBlock key={index} config={block} data={data} />;
              case 'note':
                return (
                  <p key={index} className="text-sm text-neutral-900/60">
                    {block.text}
                  </p>
                );
              default:
                return null;
            }
          })}
        </div>
      )}
    </>
  );
}

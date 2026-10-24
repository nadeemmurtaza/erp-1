'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import { reportFor } from '@/components/admin/analytics/report-registry';
import { AnalyticsDetailPage } from '@/components/admin/analytics/analytics-detail-page';

/**
 * One catch-all route for every analytics detail page (10-admin-dashboard.md
 * D3) — the slug is looked up in `report-registry.ts` and rendered through
 * `<AnalyticsDetailPage>`. Next resolves static segments before catch-alls,
 * so a report that outgrows this config shape gets its own real route file
 * at the same path and automatically wins — the designed escape hatch,
 * never a ninth block kind bolted onto this one.
 */
export default function AnalyticsReportPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = use(params);
  const report = reportFor(slug.join('/'));

  if (!report) {
    notFound();
  }

  return <AnalyticsDetailPage report={report} />;
}

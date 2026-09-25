'use client';

import Link from 'next/link';
import { PageHeader, Section, EmptyState } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';
import { useEnabledModules } from '@/components/admin/deployment-modules';
import { DASHBOARD_GROUPS } from '@/components/admin/dashboard/card-registry';
import { reportsFor } from '@/components/admin/analytics/report-registry';
import { ROUTES } from '@/constants/routes';

/**
 * The analytics report index — every report the caller may see, grouped the
 * same way the dashboard groups its cards. A report the caller lacks
 * permission for is absent here (unlike a dashboard card, which still
 * renders as an em-dash) — this list is itself the entry point, not a tile
 * grid with its own permission-aware rendering per row.
 */
export default function AnalyticsIndexPage() {
  const session = useAdminSession();
  const enabledModules = useEnabledModules();
  const reports = reportsFor(enabledModules ?? []).filter(
    (report) => report.permissions.length === 0 || report.permissions.some((key) => session.can(key)),
  );

  return (
    <>
      <PageHeader title="Analytics" description="Every report behind the dashboard's cards, in one place." />

      {reports.length === 0 ? (
        <EmptyState title="No reports available." description="Ask an administrator for access if you need one." />
      ) : (
        <div className="flex flex-col gap-6">
          {DASHBOARD_GROUPS.map((group) => {
            const groupReports = reports.filter((report) => report.group === group.key);
            if (groupReports.length === 0) return null;
            return (
              <Section key={group.key} title={group.label}>
                <ul className="flex flex-col divide-y divide-neutral-100">
                  {groupReports.map((report) => (
                    <li key={report.slug} className="py-2">
                      <Link href={ROUTES.admin.analyticsReport(report.slug)} className="font-medium text-neutral-900 hover:underline">
                        {report.title}
                      </Link>
                      <p className="text-sm text-neutral-900/60">{report.description}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            );
          })}
        </div>
      )}
    </>
  );
}

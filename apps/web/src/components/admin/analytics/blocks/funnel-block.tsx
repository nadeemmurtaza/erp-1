import { Section, EmptyState } from '@/components/ui';
import { FunnelChart } from '@/components/admin/funnel-chart';
import { resolvePath } from '../resolve-path';
import type { ReportBlock } from '../report-registry';

type FunnelBlockConfig = Extract<ReportBlock, { kind: 'funnel' }>;

/** A stepped conversion funnel — `funnel-chart.tsx` predates Recharts (D9's own kept chart) and needs no wrapper beyond this config shim. */
export function FunnelBlock({ config, data }: { config: FunnelBlockConfig; data: unknown }) {
  const rows = resolvePath(data, config.path);
  const stages = Array.isArray(rows)
    ? (rows as Array<Record<string, unknown>>).map((row) => ({
        label: String(resolvePath(row, config.label) ?? '—'),
        value: Number(resolvePath(row, config.value) ?? 0),
      }))
    : [];

  return (
    <Section title={config.title}>
      {stages.length === 0 ? <EmptyState title="No data in this window." /> : <FunnelChart stages={stages} />}
    </Section>
  );
}

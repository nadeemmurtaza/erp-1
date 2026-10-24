import { Section, EmptyState } from '@/components/ui';
import { ShareChart } from '@/components/admin/charts';
import { resolvePath } from '../resolve-path';
import type { ReportBlock } from '../report-registry';

type ShareBlockConfig = Extract<ReportBlock, { kind: 'share' }>;

/**
 * A categorical share of a whole. `drillTo` (D3: "clicking a slice
 * navigates there carrying the clicked key as a filter") is declared on the
 * block config for a future report that needs it, but no report in this
 * registry sets it yet, and `ShareChart` (WO-A.2) has no per-slice click
 * handler to wire it to today — implementing the navigation ahead of a
 * chart that can fire it would be dead code, not a feature. Wiring both
 * together is the next report that actually needs a drill-down's job.
 */
export function ShareBlock({ config, data }: { config: ShareBlockConfig; data: unknown }) {
  const rows = resolvePath(data, config.path);
  const items = Array.isArray(rows)
    ? (rows as Array<Record<string, unknown>>).map((row) => ({
        label: String(resolvePath(row, config.label) ?? '—'),
        value: Number(resolvePath(row, config.value) ?? 0),
      }))
    : [];

  return (
    <Section title={config.title}>
      {items.length === 0 ? <EmptyState title="No data in this window." /> : <ShareChart items={items} format={config.format} />}
    </Section>
  );
}

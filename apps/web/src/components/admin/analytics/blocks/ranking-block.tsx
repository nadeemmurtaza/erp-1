import { Section, EmptyState } from '@/components/ui';
import { CategoryBarChart } from '@/components/admin/charts';
import { resolvePath } from '../resolve-path';
import type { ReportBlock } from '../report-registry';

type RankingBlockConfig = Extract<ReportBlock, { kind: 'ranking' }>;

/**
 * A ranked list — top products, top suppliers, top customers. `href` (a
 * per-row drill-down template) is declared on the block config for a
 * ranking that needs one, same reasoning as `ShareBlock`'s `drillTo`:
 * `CategoryBarChart` (WO-A.2) has no per-bar click handler yet, so wiring a
 * link with nothing visible to attach it to would be a fake interaction —
 * the `table` block already covers "ranked rows you can click" today via
 * its own `href` column, which DOES render a real, visible link per row.
 */
export function RankingBlock({ config, data }: { config: RankingBlockConfig; data: unknown }) {
  const rows = resolvePath(data, config.path);
  const items = Array.isArray(rows)
    ? (rows as Array<Record<string, unknown>>).slice(0, config.limit ?? 10).map((row) => ({
        label: String(resolvePath(row, config.label) ?? '—'),
        value: Number(resolvePath(row, config.value) ?? 0),
      }))
    : [];

  return (
    <Section title={config.title}>
      {items.length === 0 ? <EmptyState title="No data in this window." /> : <CategoryBarChart items={items} format={config.format} />}
    </Section>
  );
}

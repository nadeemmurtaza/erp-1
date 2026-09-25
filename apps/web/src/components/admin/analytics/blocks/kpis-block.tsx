import { formatValue } from '@/components/admin/dashboard/metric-card';
import { resolvePath } from '../resolve-path';
import type { ReportBlock } from '../report-registry';

type KpisBlockConfig = Extract<ReportBlock, { kind: 'kpis' }>;

/** A row of headline figures — the first thing a detail page shows. */
export function KpisBlock({ config, data }: { config: KpisBlockConfig; data: unknown }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {config.items.map((item) => {
        const value = resolvePath(data, item.path);
        const numeric = typeof value === 'number' ? value : 0;
        return (
          <div key={item.path} className="card p-4" title={item.hint}>
            <span className="block text-xs font-medium text-neutral-900/60">{item.label}</span>
            <span className="mt-1 block text-xl font-semibold tabular-nums text-neutral-900">
              {value === undefined ? '—' : formatValue(item.format, numeric)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

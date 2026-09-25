import { Section } from '@/components/ui';
import { TimeSeriesChart } from '@/components/admin/charts';
import { resolvePath } from '../resolve-path';
import type { ReportBlock } from '../report-registry';

type TimeSeriesBlockConfig = Extract<ReportBlock, { kind: 'timeseries' }>;

export function TimeSeriesBlock({ config, data }: { config: TimeSeriesBlockConfig; data: unknown }) {
  const rows = resolvePath(data, config.path);
  const points = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];

  return (
    <Section title={config.title}>
      <TimeSeriesChart
        data={points}
        x={config.x}
        series={config.series.map((s) => ({ key: s.key, label: s.label, format: s.format }))}
        chart={config.chart === 'stacked-bar' ? 'area' : config.chart === 'bar' ? 'area' : config.chart}
        ariaLabel={config.title}
      />
    </Section>
  );
}

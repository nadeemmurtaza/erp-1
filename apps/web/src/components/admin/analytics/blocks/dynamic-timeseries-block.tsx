import { Section } from '@/components/ui';
import { TimeSeriesChart } from '@/components/admin/charts';
import { resolvePath } from '../resolve-path';
import type { ReportBlock } from '../report-registry';

type DynamicTimeSeriesBlockConfig = Extract<ReportBlock, { kind: 'dynamic-timeseries' }>;

/**
 * WO-57.2 — `TimeSeriesBlock`'s own chart, reused as-is; the only
 * difference is that `series` is read from the response at render time
 * (`config.seriesPath`) instead of from static registry config, since the
 * categories a category-velocity chart draws are a client's own data.
 */
export function DynamicTimeSeriesBlock({ config, data }: { config: DynamicTimeSeriesBlockConfig; data: unknown }) {
  const rows = resolvePath(data, config.path);
  const points = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];

  const seriesData = resolvePath(data, config.seriesPath);
  const series = Array.isArray(seriesData)
    ? (seriesData as Array<{ key: string; label: string }>).map((s) => ({ key: s.key, label: s.label, format: config.format }))
    : [];

  return (
    <Section title={config.title}>
      <TimeSeriesChart data={points} x={config.x} series={series} chart={config.chart} ariaLabel={config.title} />
    </Section>
  );
}

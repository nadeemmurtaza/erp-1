import { formatMoney } from '@newax/shared';
import { Section } from '@/components/ui';
import { GaugeChart } from '@/components/admin/gauge-chart';
import { resolvePath } from '../resolve-path';
import type { ReportBlock } from '../report-registry';

type GaugeBlockConfig = Extract<ReportBlock, { kind: 'gauge' }>;

/** A single percent-of-target figure, on the superseded `admin/gauge-chart.tsx` until a designer moves it to `charts/` (see `check-chart-imports.mjs`). `value` is basis points; `target` is the money amount shown in the caption. */
export function GaugeBlock({ config, data }: { config: GaugeBlockConfig; data: unknown }) {
  const percentBps = Number(resolvePath(data, config.value) ?? 0);
  const targetAmount = Number(resolvePath(data, config.target) ?? 0);
  const percent = Math.round(percentBps / 100);

  return (
    <Section title={config.title}>
      <GaugeChart percent={percent} caption={targetAmount > 0 ? `Target: ${formatMoney(targetAmount)}` : undefined} />
    </Section>
  );
}

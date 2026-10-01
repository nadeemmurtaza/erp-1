import type { ReactNode } from 'react';

interface TooltipEntry {
  name?: string | number;
  value?: unknown;
  color?: string;
  dataKey?: unknown;
}

/**
 * The one readout, every series (dataviz `interaction.md`): the value leads in
 * the strongest ink, the series name follows in the secondary ink, and a short
 * line key in the series colour carries identity. Text never wears the series
 * colour. A floating surface is `bg-overlay` over a shadow, never a border.
 *
 * Tooltips enhance and never gate: every figure shown here is also in the
 * chart's table twin.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
}: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: ReactNode;
  formatValue: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-md bg-overlay px-3 py-2 text-sm shadow-overlay">
      {label != null && label !== '' ? <p className="mb-1 text-xs text-neutral-900/70">{label}</p> : null}
      <ul className="grid gap-1">
        {payload.map((entry) => (
          <li
            key={String(typeof entry.dataKey === 'function' ? entry.name : (entry.dataKey ?? entry.name))}
            className="flex items-center gap-2"
          >
            <svg width="12" height="4" viewBox="0 0 12 4" aria-hidden="true" className="shrink-0">
              <rect width="12" height="4" rx="2" fill={entry.color} />
            </svg>
            <span className="font-semibold tabular-nums text-neutral-900">{formatValue(Number(entry.value ?? 0))}</span>
            <span className="text-neutral-900/70">{entry.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

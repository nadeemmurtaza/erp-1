'use client';

/**
 * Stepped conversion funnel: each stage's bar narrower than the last, width
 * encoding its count against the largest stage. Matches sales-chart.tsx's
 * idiom — inline SVG, a single brand-teal accent, minimal direct labels.
 *
 * The count and conversion percentage are drawn above the bar rather than
 * inside it, so a near-zero final stage never has to carry its own
 * (illegibly cramped) label.
 */
const FILL = '#0f8fa3';

const WIDTH = 320;
const ROW_HEIGHT = 52;
const BAR_HEIGHT = 20;
const LABEL_Y_OFFSET = 14;
const BAR_Y_OFFSET = 20;

export interface FunnelStage {
  label: string;
  value: number;
}

export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const allZero = stages.every((stage) => stage.value === 0);
  if (allZero) {
    return <p className="p-8 text-center text-sm text-ink/50">No visitor activity yet.</p>;
  }

  const max = Math.max(...stages.map((stage) => stage.value), 1);
  const height = stages.length * ROW_HEIGHT;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full" role="img" aria-label="Conversion funnel">
      {stages.map((stage, index) => {
        const rowTop = index * ROW_HEIGHT;
        const barWidth = stage.value > 0 ? Math.max((stage.value / max) * WIDTH, 6) : 0;
        const barX = (WIDTH - barWidth) / 2;
        const previous = index > 0 ? stages[index - 1]!.value : null;
        const conversion = previous && previous > 0 ? Math.round((stage.value / previous) * 100) : null;

        return (
          <g key={stage.label}>
            <text x={0} y={rowTop + LABEL_Y_OFFSET} textAnchor="start" fontSize={12} className="fill-ink">
              {stage.label}
            </text>
            <text
              x={WIDTH}
              y={rowTop + LABEL_Y_OFFSET}
              textAnchor="end"
              fontSize={12}
              fontWeight={600}
              className="fill-ink"
            >
              {stage.value.toLocaleString('en-PK')}
              {conversion !== null ? (
                <tspan className="fill-ink/50" fontWeight={400}>
                  {' '}
                  · {conversion}%
                </tspan>
              ) : null}
            </text>
            <rect
              x={barX}
              y={rowTop + BAR_Y_OFFSET}
              width={barWidth}
              height={BAR_HEIGHT}
              rx={5}
              fill={FILL}
            />
          </g>
        );
      })}
    </svg>
  );
}

'use client';

/**
 * Semicircular progress gauge for a single percent-of-target metric.
 *
 * Matches sales-chart.tsx's idiom: inline SVG, brand teal fill against a
 * muted track, one direct label (the percent, centered) rather than a
 * cluttered dial. Supporting figures are passed in as `caption` and rendered
 * below the arc, the same figure/figcaption split sales-chart.tsx uses for
 * its hover readout.
 *
 * The arc itself always caps at a full semicircle so a wildly over-target
 * month can't overflow the drawing — the percent text underneath still shows
 * the true figure (DashboardSummary.monthlyTarget.percent is pre-clamped to
 * 0-999 by the API, so it can legitimately read above 100).
 */
const FILL = '#0f8fa3';
const TRACK = '#e9e0cd';

const WIDTH = 200;
const HEIGHT = 118;
const CX = 100;
const CY = 104;
const RADIUS = 80;
const STROKE = 16;

const ARC_PATH = `M ${CX - RADIUS} ${CY} A ${RADIUS} ${RADIUS} 0 0 1 ${CX + RADIUS} ${CY}`;

export function GaugeChart({ percent, caption }: { percent: number; caption?: string }) {
  const fraction = Math.min(Math.max(percent, 0), 100) / 100;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`${percent}% of monthly target`}
      >
        <path
          d={ARC_PATH}
          fill="none"
          stroke={TRACK}
          strokeWidth={STROKE}
          strokeLinecap="round"
          pathLength={100}
        />
        <path
          d={ARC_PATH}
          fill="none"
          stroke={FILL}
          strokeWidth={STROKE}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${fraction * 100} 100`}
        />
        <text x={CX} y={CY - 16} textAnchor="middle" className="fill-ink" fontSize={28} fontWeight={600}>
          {percent}%
        </text>
      </svg>

      {caption ? <figcaption className="mt-1 text-center text-xs text-ink/60">{caption}</figcaption> : null}
    </figure>
  );
}

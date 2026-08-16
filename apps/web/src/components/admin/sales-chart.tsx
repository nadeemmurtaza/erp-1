'use client';

import { useMemo, useState } from 'react';
import { formatMoney, toMajor } from '@yaseen/shared';

/**
 * Daily revenue over the selected window.
 *
 * ONE series, so there is no legend — the heading says what is plotted — and the
 * value is direct-labelled only at the peak and the last point rather than on
 * every day. Drawn as inline SVG rather than pulling in a charting library for a
 * single line.
 *
 * The mark colour is #0f8fa3: the brand teal snapped to the nearest step that
 * clears the chroma floor and 3:1 contrast against the white card. The nominal
 * brand teal reads as gray at data-mark size.
 */
const SERIES = '#0f8fa3';
const GRID = '#e9e0cd';
const SURFACE = '#ffffff';

const WIDTH = 720;
const HEIGHT = 220;
const PADDING = { top: 16, right: 16, bottom: 28, left: 56 };

interface Point {
  date: string;
  orders: number;
  revenue: number;
}

export function SalesChart({ series }: { series: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const plot = useMemo(() => {
    const innerWidth = WIDTH - PADDING.left - PADDING.right;
    const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

    const max = Math.max(...series.map((point) => point.revenue), 1);
    // Round the axis top to a clean rupee figure so the ticks read well.
    const step = niceStep(toMajor(max));
    const axisTop = Math.max(step * 2, Math.ceil(toMajor(max) / step) * step);

    const x = (index: number) =>
      PADDING.left +
      (series.length <= 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);

    const y = (revenue: number) =>
      PADDING.top + innerHeight - (toMajor(revenue) / axisTop) * innerHeight;

    return {
      x,
      y,
      axisTop,
      step,
      innerWidth,
      innerHeight,
      points: series.map((point, index) => ({ ...point, cx: x(index), cy: y(point.revenue) })),
    };
  }, [series]);

  if (series.length === 0) {
    return <p className="p-8 text-center text-sm text-ink/50">No sales yet.</p>;
  }

  const path = plot.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.cx.toFixed(1)},${point.cy.toFixed(1)}`)
    .join(' ');

  const areaPath = `${path} L${plot.points.at(-1)!.cx.toFixed(1)},${(HEIGHT - PADDING.bottom).toFixed(1)} L${plot.points[0]!.cx.toFixed(1)},${(HEIGHT - PADDING.bottom).toFixed(1)} Z`;

  const peakIndex = plot.points.reduce(
    (best, point, index) => (point.revenue > plot.points[best]!.revenue ? index : best),
    0,
  );
  const lastIndex = plot.points.length - 1;

  const ticks = [0, plot.step, plot.axisTop / 2, plot.axisTop].filter(
    (value, index, all) => all.indexOf(value) === index && value <= plot.axisTop,
  );

  const active = hover === null ? null : plot.points[hover];

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Daily revenue over the last ${series.length} days`}
        onMouseLeave={() => setHover(null)}
      >
        {/* Recessive gridlines: hairline, solid, one step off the surface. */}
        {ticks.map((tick) => {
          const ty = PADDING.top + plot.innerHeight - (tick / plot.axisTop) * plot.innerHeight;
          return (
            <g key={tick}>
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={ty}
                y2={ty}
                stroke={GRID}
                strokeWidth={1}
              />
              <text
                x={PADDING.left - 8}
                y={ty + 4}
                textAnchor="end"
                className="fill-ink/50"
                fontSize={11}
              >
                {tick === 0 ? '0' : compactRupees(tick)}
              </text>
            </g>
          );
        })}

        {/* The area is a 10% wash, never a saturated block. */}
        <path d={areaPath} fill={SERIES} fillOpacity={0.1} />
        <path
          d={path}
          fill="none"
          stroke={SERIES}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Direct labels only at the peak and the latest day. */}
        {[peakIndex, lastIndex]
          .filter((index, position, all) => all.indexOf(index) === position)
          .filter((index) => plot.points[index]!.revenue > 0)
          .map((index) => {
            const point = plot.points[index]!;
            return (
              <g key={`label-${index}`}>
                <circle cx={point.cx} cy={point.cy} r={5} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
                <text
                  x={Math.min(point.cx, WIDTH - PADDING.right - 40)}
                  y={Math.max(point.cy - 12, PADDING.top + 10)}
                  textAnchor="middle"
                  className="fill-ink"
                  fontSize={11}
                  fontWeight={600}
                >
                  {compactRupees(toMajor(point.revenue))}
                </text>
              </g>
            );
          })}

        {/* Date axis: first, middle and last only, so labels never collide. */}
        {[0, Math.floor(lastIndex / 2), lastIndex]
          .filter((index, position, all) => all.indexOf(index) === position)
          .map((index) => (
            <text
              key={`date-${index}`}
              x={plot.x(index)}
              y={HEIGHT - 8}
              textAnchor={index === 0 ? 'start' : index === lastIndex ? 'end' : 'middle'}
              className="fill-ink/50"
              fontSize={11}
            >
              {shortDate(series[index]!.date)}
            </text>
          ))}

        {/* Crosshair on hover. */}
        {active ? (
          <g>
            <line
              x1={active.cx}
              x2={active.cx}
              y1={PADDING.top}
              y2={HEIGHT - PADDING.bottom}
              stroke={SERIES}
              strokeWidth={1}
              strokeOpacity={0.4}
            />
            <circle cx={active.cx} cy={active.cy} r={5} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
          </g>
        ) : null}

        {/* Hit targets wider than the marks, so hovering is easy. */}
        {plot.points.map((point, index) => (
          <rect
            key={point.date}
            x={point.cx - plot.innerWidth / (series.length * 2) - 2}
            y={PADDING.top}
            width={plot.innerWidth / series.length + 4}
            height={plot.innerHeight}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          />
        ))}
      </svg>

      <figcaption className="mt-2 min-h-5 text-xs text-ink/60">
        {active ? (
          <span>
            <span className="font-medium text-ink">{longDate(active.date)}</span> ·{' '}
            {formatMoney(active.revenue)} · {active.orders}{' '}
            {active.orders === 1 ? 'order' : 'orders'}
          </span>
        ) : (
          <span>Hover a day for its figures.</span>
        )}
      </figcaption>
    </figure>
  );
}

/** 1 / 2 / 5 × 10ⁿ, so axis ticks land on numbers people read easily. */
function niceStep(max: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(max, 1)));
  const normalised = max / magnitude;

  if (normalised <= 2) return magnitude / 2;
  if (normalised <= 5) return magnitude;
  return magnitude * 2;
}

function compactRupees(rupees: number): string {
  if (rupees >= 100_000) return `${(rupees / 100_000).toFixed(1)}L`;
  if (rupees >= 1_000) return `${Math.round(rupees / 1_000)}k`;
  return String(Math.round(rupees));
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

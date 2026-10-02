'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { formatDateShort, formatMonthShort, formatNumber, formatWeekdayShort } from '@newax/shared';
import { EmptyState } from '@/components/ui';
import { ChartDataTable } from './chart-data-table';
import { buildHeatCalendar, heatMonthTotals, type HeatCell, type HeatDay } from './chart-math';
import { GRID, INK, INK_FAINT, paletteColor } from './chart-theme';

const CELL = 14;
const GAP = 3;
const PITCH = CELL + GAP;
const GUTTER_X = 30;
const GUTTER_Y = 18;

/** Opacity of the one hue at levels 1 to 4. Level 0 is the neutral track, so "nothing happened" is never a faint colour. */
const LEVEL_OPACITY = [0, 0.3, 0.55, 0.8, 1] as const;

/** A calendar day carries no time zone, so it is parsed and printed as UTC; any other zone could slide it a day. */
const DAY_ZONE = 'UTC';

/**
 * How busy each day was, over the last year: tickets opened, orders packed,
 * logins. Weeks are columns, Monday to Sunday down the rows, the newest week at
 * the right edge, so the shape of a quiet fortnight or a busy month-end is seen
 * before any number is read.
 *
 * One hue, five steps (dataviz: magnitude is a sequential ramp of a single hue,
 * never a rainbow). The steps are quartiles of the days that had any activity,
 * not equal slices of the maximum, so one outlier day cannot flatten every other
 * day into the palest step. A day with no activity is the neutral track, not the
 * palest step.
 *
 * Cells are 14 px with a 3 px gap, too small to be a pointer target of their
 * own, which is accepted here because the keyboard path is complete: the grid is
 * one tab stop, arrow keys move by day and by week, and the line under the grid
 * names whichever day is pointed at or focused (it starts on the busiest day, so
 * it is never blank). The grid scrolls inside its own box when the width is
 * short, starting at the newest week. It keeps its left-to-right order in a
 * right-to-left layout because time on this axis is always left to right.
 *
 * The table twin is per month, not per day: twelve rows tell a screen reader
 * what three hundred and sixty-five cells would, and every cell stays reachable
 * on its own by arrow key.
 */
export function CalendarHeatmap({
  days,
  weeks = 52,
  unit = 'events',
}: {
  days: readonly HeatDay[];
  weeks?: number;
  /** The plural noun for what is counted: "tickets", "orders". */
  unit?: string;
}) {
  const calendar = useMemo(() => buildHeatCalendar(days, weeks), [days, weeks]);
  const months = useMemo(() => heatMonthTotals(calendar), [calendar]);
  const cells = useRef(new Map<string, SVGRectElement>());
  const [active, setActive] = useState<HeatCell | null>(null);
  const [stop, setStop] = useState<string | null>(null);

  if (calendar.weeks.length === 0) {
    return <EmptyState title="No activity in this window." />;
  }

  const all = calendar.weeks.flat().filter((c): c is HeatCell => c != null);
  const latest = all[all.length - 1]!;
  const busiest = all.reduce((best, c) => (c.value > best.value ? c : best), all[0]!);
  const tabStop = stop ?? latest.date;
  const dayLabel = (date: string) => formatDateShort(date, 'en', { withWeekday: true }, DAY_ZONE);
  const describe = (cell: HeatCell) => `${dayLabel(cell.date)}: ${formatNumber(cell.value)} ${unit}`;
  const width = calendar.weeks.length * PITCH - GAP;
  const height = GUTTER_Y + 7 * PITCH - GAP;
  const total = all.reduce((sum, c) => sum + c.value, 0);
  const ariaLabel = `${formatNumber(total)} ${unit} over ${all.length} days; busiest ${dayLabel(busiest.date)} with ${formatNumber(busiest.value)}`;

  const move = (event: KeyboardEvent, week: number, row: number) => {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    let w = week;
    let r = row;
    if (event.key in step) {
      w += step[event.key]![0];
      r += step[event.key]![1];
    } else if (event.key === 'Home') {
      w = 0;
    } else if (event.key === 'End') {
      w = calendar.weeks.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    // Home and End land on the nearest day that exists in that row; a missing day is the future.
    const target = calendar.weeks[w]?.[r] ?? (event.key === 'End' ? calendar.weeks[w - 1]?.[r] : null);
    if (!target) return;
    setStop(target.date);
    cells.current.get(target.date)?.focus();
  };

  const shown = active ?? busiest;
  const labelledMonths = calendar.months.filter((m, i) => (calendar.months[i + 1]?.column ?? Infinity) - m.column >= 3);
  const weekdayLabels = [0, 2, 4].map((row) => ({ row, date: calendar.weeks[0]![row]?.date }));

  return (
    <figure className="m-0 grid grid-cols-1 gap-3">
      <div dir="ltr" className="flex w-full">
        {/* The weekday names stay put while the weeks scroll under them. */}
        <svg width={GUTTER_X} height={height} aria-hidden="true" className="shrink-0">
          {weekdayLabels.map(({ row, date }) =>
            date ? (
              <text key={row} x={0} y={GUTTER_Y + row * PITCH + CELL - 3} fontSize={11} fill={INK_FAINT}>
                {formatWeekdayShort(date, 'en', DAY_ZONE)}
              </text>
            ) : null,
          )}
        </svg>
        <div className="min-w-0 flex-1 overflow-x-auto" ref={(el) => void (el && (el.scrollLeft = el.scrollWidth))}>
          <svg width={width} height={height} className="block max-w-none">
            {labelledMonths.map((m) => (
              <text key={m.date} x={m.column * PITCH} y={11} fontSize={11} fill={INK_FAINT}>
                {formatMonthShort(m.date, 'en', DAY_ZONE)}
              </text>
            ))}

            <g role="grid" aria-label={ariaLabel}>
              {Array.from({ length: 7 }, (_, row) => (
                <g key={row} role="row">
                  {calendar.weeks.map((week, w) => {
                    const cell = week[row];
                    if (!cell) return null;
                    const x = w * PITCH;
                    const y = GUTTER_Y + row * PITCH;
                    const isStop = cell.date === tabStop;
                    const isActive = active?.date === cell.date;
                    return (
                      <g key={cell.date}>
                        <rect
                          role="gridcell"
                          aria-label={describe(cell)}
                          tabIndex={isStop ? 0 : -1}
                          ref={(el) => {
                            if (el) cells.current.set(cell.date, el);
                            else cells.current.delete(cell.date);
                          }}
                          x={x}
                          y={y}
                          width={CELL}
                          height={CELL}
                          rx={3}
                          fill={cell.level === 0 ? GRID : paletteColor(0)}
                          fillOpacity={cell.level === 0 ? 1 : LEVEL_OPACITY[cell.level]}
                          className="outline-none"
                          onMouseEnter={() => setActive(cell)}
                          onMouseLeave={() => setActive(null)}
                          onFocus={() => {
                            setActive(cell);
                            setStop(cell.date);
                          }}
                          onBlur={() => setActive(null)}
                          onKeyDown={(event) => move(event, w, row)}
                        />
                        {isActive ? (
                          <rect
                            x={x - 1}
                            y={y - 1}
                            width={CELL + 2}
                            height={CELL + 2}
                            rx={4}
                            fill="none"
                            stroke={INK}
                            strokeWidth={2}
                            pointerEvents="none"
                          />
                        ) : null}
                      </g>
                    );
                  })}
                </g>
              ))}
            </g>
          </svg>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
        <p role="status" className="m-0 min-w-0 text-neutral-900">
          <span className="text-neutral-900/70">{active ? 'Selected' : 'Busiest day'}: </span>
          <span className="font-semibold tabular-nums">{describe(shown)}</span>
        </p>
        <div className="flex items-center gap-1.5 text-xs text-neutral-900/70" aria-hidden="true">
          Less
          {LEVEL_OPACITY.map((opacity, level) => (
            <svg key={level} width={CELL} height={CELL} viewBox={`0 0 ${CELL} ${CELL}`}>
              <rect
                width={CELL}
                height={CELL}
                rx={3}
                fill={level === 0 ? GRID : paletteColor(0)}
                fillOpacity={level === 0 ? 1 : opacity}
              />
            </svg>
          ))}
          More
        </div>
      </div>

      <ChartDataTable
        caption={ariaLabel}
        columns={['Month', 'Total', 'Busiest day']}
        rows={months.map((m) => [
          `${formatMonthShort(`${m.month}-01`, 'en', DAY_ZONE)} ${m.month.slice(0, 4)}`,
          `${formatNumber(m.total)} ${unit}`,
          `${dayLabel(m.busiest.date)}: ${formatNumber(m.busiest.value)}`,
        ])}
      />
    </figure>
  );
}

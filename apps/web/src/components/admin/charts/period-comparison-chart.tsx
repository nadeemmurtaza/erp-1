"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatNumber } from "@newax/shared";
import { Badge, DataTable, EmptyState } from "@/components/ui";
import { cn } from "@/utils/cn";
import { ChartDataTable } from "./chart-data-table";
import { changeTone, periodChange } from "./chart-math";
import { ChartTooltip } from "./chart-tooltip";
import {
  CONTEXT,
  GRID,
  HOVER_WASH,
  INK_FAINT,
  compactMoney,
  paletteColor,
  type ValueFormat,
} from "./chart-theme";
import { usePrefersReducedMotion } from "./use-reduced-motion";

export interface PeriodComparisonPoint {
  label: string;
  current: number;
  previous: number;
}

type SeriesKey = "current" | "previous";

const MINUS = "−";

/**
 * This period against the last, per category: a grouped bar, the legend that
 * filters it, and the table that says the same thing in numbers.
 *
 * Form (dataviz `choosing-a-form.md`): the current period is the point and the
 * previous one is context, so it is the emphasis form: one hue and a gray, not
 * two categorical slots. Marks follow `marks-and-anatomy.md`: bars at most 24 px
 * thick, a 4 px rounded data-end and a square base, a 2 px gap between the pair,
 * a hairline solid grid, no number on every bar. The legend is always present
 * for two series, and it is also the filter: pressing a series isolates the other
 * (color follows the entity, so the survivor keeps its colour). The last visible
 * series cannot be hidden, because an empty chart is not a filter result.
 *
 * Direction is never colour alone: the change column carries a sign and an arrow
 * as well as a tone. `upIsGood` says which way is the good one (a falling return
 * rate is an improvement), and only the tone depends on it.
 */
export function PeriodComparisonChart({
  points,
  format = "money",
  currentLabel = "Current period",
  previousLabel = "Previous period",
  categoryLabel = "Category",
  upIsGood = true,
  showTable = true,
  height = 240,
}: {
  points: readonly PeriodComparisonPoint[];
  format?: ValueFormat;
  currentLabel?: string;
  previousLabel?: string;
  /** The first column's heading in the table — "Region", "Branch". */
  categoryLabel?: string;
  upIsGood?: boolean;
  /** The change table under the chart. Off when the screen already has its own table of these rows. */
  showTable?: boolean;
  height?: number;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<SeriesKey>>(new Set());
  const reduced = usePrefersReducedMotion();

  if (points.length === 0) {
    return <EmptyState title="No data in this window." />;
  }

  const formatValue = (value: number) =>
    format === "money" ? formatMoney(value) : formatNumber(value);
  const series: { key: SeriesKey; label: string; color: string }[] = [
    { key: "current", label: currentLabel, color: paletteColor(0) },
    { key: "previous", label: previousLabel, color: CONTEXT },
  ];

  const toggle = (key: SeriesKey) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < series.length - 1) next.add(key);
      return next;
    });

  const ariaLabel = `${currentLabel} against ${previousLabel} across ${points.length} categories`;

  return (
    <div className="grid gap-4">
      <div role="group" aria-label="Series" className="flex flex-wrap gap-2">
        {series.map((s) => {
          const on = !hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s.key)}
              className={cn(
                "inline-flex min-h-touch items-center gap-2 rounded-md px-3 text-sm transition-colors duration-fast ease-standard fold:min-h-9",
                on
                  ? "bg-neutral-100 text-neutral-900"
                  : "text-neutral-900/70 hover:bg-neutral-50",
              )}
            >
              {/* Off is a hollow swatch as well as a dimmer label, so the state is never colour alone. */}
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                aria-hidden="true"
              >
                <rect
                  x="1"
                  y="1"
                  width="8"
                  height="8"
                  rx="2"
                  fill={on ? s.color : "none"}
                  stroke={s.color}
                  strokeWidth="2"
                />
              </svg>
              {s.label}
            </button>
          );
        })}
      </div>

      <div role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={points as PeriodComparisonPoint[]}
            barGap={2}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: INK_FAINT }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
            />
            <YAxis
              tickFormatter={(value: number) =>
                format === "money" ? compactMoney(value) : formatNumber(value)
              }
              tick={{ fontSize: 11, fill: INK_FAINT }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: HOVER_WASH }}
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  payload={props.payload}
                  label={props.label}
                  formatValue={formatValue}
                />
              )}
            />
            {series.map((s) =>
              hidden.has(s.key) ? null : (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  isAnimationActive={!reduced}
                />
              ),
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {showTable ? (
        <DataTable
          rows={[...points]}
          rowKey={(point) => point.label}
          columns={[
            { header: categoryLabel, cell: (point) => point.label },
            {
              header: currentLabel,
              align: "end",
              numeric: true,
              cell: (point) => formatValue(point.current),
            },
            {
              header: previousLabel,
              align: "end",
              numeric: true,
              muted: true,
              cell: (point) => formatValue(point.previous),
            },
            {
              header: "Change",
              align: "end",
              numeric: true,
              cell: (point) => {
                const diff = point.current - point.previous;
                return `${diff > 0 ? "+" : diff < 0 ? MINUS : ""}${formatValue(Math.abs(diff))}`;
              },
            },
            {
              header: "Growth",
              align: "end",
              cell: (point) => <Growth point={point} upIsGood={upIsGood} />,
            },
          ]}
        />
      ) : (
        <ChartDataTable
          caption={ariaLabel}
          columns={[categoryLabel, currentLabel, previousLabel]}
          rows={points.map((p) => [
            p.label,
            formatValue(p.current),
            formatValue(p.previous),
          ])}
        />
      )}
    </div>
  );
}

function Growth({
  point,
  upIsGood,
}: {
  point: PeriodComparisonPoint;
  upIsGood: boolean;
}) {
  const { kind, pct } = periodChange(point.current, point.previous);
  if (kind === "new") return <span className="text-neutral-900/60">New</span>;

  const Icon =
    kind === "up" ? ArrowUpRight : kind === "down" ? ArrowDownRight : Minus;

  return (
    <Badge tone={changeTone(kind, upIsGood)} className="tabular-nums">
      <Icon aria-hidden="true" className="h-3 w-3" />
      {kind === "up" ? "+" : kind === "down" ? MINUS : ""}
      {formatNumber(pct)}%
    </Badge>
  );
}

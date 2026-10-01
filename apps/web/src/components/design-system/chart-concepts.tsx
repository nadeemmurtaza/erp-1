'use client';

import { formatDateShort, formatMonthShort } from '@newax/shared';
import {
  CalendarHeatmap,
  FunnelChart,
  GaugeChart,
  PointLineChart,
  RadarChart,
  RangeChart,
  SmallMultiplesChart,
  StackedAreaChart,
  TimeSeriesChart,
} from '@/components/admin/charts';
import { DataTable } from '@/components/ui';

/**
 * The chart forms from the dashboard reference, each tied to the shape of data
 * it is for. A chart is chosen by what the data is (ordered stages, a volatile
 * series, a spread, a goal, a total and its parts, a count per day, a profile),
 * never by what looks richest, so the first group is the rule and the rest are
 * the forms it picks. Every form lives in `components/admin/charts/`, takes its
 * numbers as props, and ships its own table twin, empty state and keyboard path.
 *
 * The figures below are illustrative. A real screen passes what its endpoint
 * returned; nothing here is read from the shop.
 */

/* ── the rule ─────────────────────────────────────────────────────────── */

const FORMS = [
  {
    form: 'Funnel',
    shape: 'Ordered stages, each a subset of the one before',
    use: 'Lead to signed contract; order placed to delivered',
    not: 'Stages that are not nested, or that can grow',
  },
  {
    form: 'Point line',
    shape: 'One volatile series where each reading matters',
    use: 'Failed postings per day; alerts a rule raised',
    not: 'A smooth trend: use a line without markers',
  },
  {
    form: 'Range',
    shape: 'Lowest, average and highest per period',
    use: 'Delivery time and SLA spread',
    not: 'One value per period',
  },
  {
    form: 'Multi-line',
    shape: 'Two to four series on one scale over time',
    use: 'Projected against actual; budget against spend',
    not: 'Series in different units: two charts',
  },
  {
    form: 'Gauge',
    shape: 'One value against a fixed goal or limit',
    use: 'Storage, a quota, a sales target',
    not: 'A measure with no ceiling',
  },
  {
    form: 'Stacked area',
    shape: 'A total over time and what it is made of',
    use: 'Revenue by channel; tickets by queue',
    not: 'Exact comparison between layers, or more than six',
  },
  {
    form: 'Calendar heatmap',
    shape: 'One count per day, weeks across',
    use: 'Activity density; the busy day of the month',
    not: 'Fewer than a few weeks of data',
  },
  {
    form: 'Radar',
    shape: 'Five to seven measures on one scale',
    use: 'A client or supplier profile',
    not: 'Reading exact values: use its Compare view',
  },
  {
    form: 'Small multiples',
    shape: 'The same measure for two to five things',
    use: 'Sales by office; load by warehouse',
    not: 'More than five things: a table',
  },
];

export function ChartRuleSpecimen() {
  return (
    <DataTable
      stacked
      rows={FORMS}
      rowKey={(f) => f.form}
      columns={[
        { header: 'Form', cell: (f) => <span className="font-medium">{f.form}</span> },
        { header: 'Data shape', cell: (f) => f.shape },
        { header: 'Use it for', cell: (f) => f.use, muted: true },
        { header: 'Not for', cell: (f) => f.not, muted: true },
      ]}
    />
  );
}

/* ── funnel ───────────────────────────────────────────────────────────── */

const PIPELINE = [
  { label: 'Leads', value: 1_240 },
  { label: 'Qualified', value: 780 },
  { label: 'Proposals', value: 410 },
  { label: 'Signed', value: 126 },
];

export function FunnelSpecimen() {
  return (
    <div className="card p-5">
      <FunnelChart stages={PIPELINE} />
    </div>
  );
}

/* ── point line ───────────────────────────────────────────────────────── */

const POSTING_FAILURES = [3, 2, 4, 3, 5, 2, 14, 4, 3, 6, 3, 2, 9, 4].map((value, index) => ({
  label: formatDateShort(`2026-09-${String(14 + index).padStart(2, '0')}`, 'en', {}, 'UTC'),
  value,
}));

export function PointLineSpecimen() {
  return (
    <div className="card p-5">
      <PointLineChart
        points={POSTING_FAILURES}
        alert={{ value: 8, label: 'Review at 8' }}
        valueLabel="Failed postings"
      />
    </div>
  );
}

/* ── range ────────────────────────────────────────────────────────────── */

const DELIVERY_HOURS = [
  { label: 'Wk 1', min: 18, avg: 31, max: 52 },
  { label: 'Wk 2', min: 20, avg: 29, max: 44 },
  { label: 'Wk 3', min: 16, avg: 34, max: 71 },
  { label: 'Wk 4', min: 19, avg: 30, max: 48 },
  { label: 'Wk 5', min: 22, avg: 33, max: 55 },
  { label: 'Wk 6', min: 17, avg: 27, max: 39 },
  { label: 'Wk 7', min: 21, avg: 32, max: 60 },
  { label: 'Wk 8', min: 18, avg: 28, max: 42 },
];

export function RangeSpecimen() {
  return (
    <div className="card p-5">
      <RangeChart points={DELIVERY_HOURS} unit="h" />
    </div>
  );
}

/* ── smooth multi-line ────────────────────────────────────────────────── */

const WEEKS = [
  '2026-07-27',
  '2026-08-03',
  '2026-08-10',
  '2026-08-17',
  '2026-08-24',
  '2026-08-31',
  '2026-09-07',
  '2026-09-14',
];
const PROJECTED = [4_000_000, 8_200_000, 12_100_000, 16_400_000, 20_300_000, 24_600_000, 28_800_000, 33_000_000];
const ACTUAL = [3_700_000, 8_600_000, 12_900_000, 15_800_000, 21_700_000, 26_900_000, 31_200_000, 36_400_000];

const SPEND = WEEKS.map((date, i) => ({ date, projected: PROJECTED[i]!, actual: ACTUAL[i]! }));

/**
 * Projected against actual is the existing `TimeSeriesChart` with two series:
 * a curve, a dash pattern and a marker shape per series, so the pair separates
 * in greyscale. It needed nothing new, which is the point of the rule of three.
 */
export function ForecastSpecimen() {
  return (
    <div className="card p-5">
      <TimeSeriesChart
        data={SPEND}
        x="date"
        series={[
          { key: 'actual', label: 'Actual', format: 'money' },
          { key: 'projected', label: 'Projected', format: 'money' },
        ]}
        height={240}
        ariaLabel="Cumulative spend, actual against projected, eight weeks"
      />
    </div>
  );
}

/* ── gauge ────────────────────────────────────────────────────────────── */

export function GaugeSpecimen() {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-6">
        <div className="card p-5">
          <GaugeChart rings={[{ label: 'Storage', value: 41.5, max: 50 }]} kind="capacity" unit="GB" />
        </div>
        <div className="card p-5">
          <GaugeChart rings={[{ label: 'API calls', value: 485_000, max: 500_000 }]} kind="capacity" />
        </div>
        <div className="card p-5">
          <GaugeChart rings={[{ label: 'Seats', value: 18, max: 40 }]} kind="capacity" />
        </div>
      </div>
      <div className="card p-5">
        <GaugeChart
          kind="progress"
          rings={[
            { label: 'New customers', value: 188, max: 250 },
            { label: 'Orders shipped', value: 1_284, max: 1_200 },
            { label: 'Repeat buyers', value: 96, max: 150 },
            { label: 'Reviews', value: 41, max: 100 },
          ]}
        />
      </div>
    </div>
  );
}

/* ── stacked area ─────────────────────────────────────────────────────── */

const MONTHS = [
  '2026-02-01',
  '2026-03-01',
  '2026-04-01',
  '2026-05-01',
  '2026-06-01',
  '2026-07-01',
  '2026-08-01',
  '2026-09-01',
];
const CHANNEL_SERIES = [
  {
    key: 'shops',
    label: 'Shops',
    values: [9_200_000, 9_800_000, 10_400_000, 10_100_000, 11_300_000, 11_900_000, 12_400_000, 12_800_000],
  },
  {
    key: 'website',
    label: 'Website',
    values: [3_100_000, 3_600_000, 4_200_000, 4_900_000, 5_500_000, 6_300_000, 7_100_000, 7_800_000],
  },
  {
    key: 'wholesale',
    label: 'Wholesale',
    values: [4_400_000, 3_900_000, 4_800_000, 5_200_000, 4_700_000, 5_600_000, 6_000_000, 5_700_000],
  },
  {
    key: 'marketplace',
    label: 'Marketplace',
    values: [900_000, 1_200_000, 1_500_000, 1_900_000, 2_300_000, 2_600_000, 3_100_000, 3_400_000],
  },
];
const CHANNEL_ROWS = MONTHS.map((month, i) => ({
  month,
  ...Object.fromEntries(CHANNEL_SERIES.map((s) => [s.key, s.values[i]!])),
}));

const monthLabel = (value: string) => formatMonthShort(value, 'en', 'UTC');

export function StackedAreaSpecimen() {
  return (
    <div className="card p-5">
      <StackedAreaChart
        data={CHANNEL_ROWS}
        x="month"
        series={CHANNEL_SERIES.map(({ key, label }) => ({ key, label }))}
        format="money"
        formatX={monthLabel}
      />
    </div>
  );
}

/* ── calendar heatmap ─────────────────────────────────────────────────── */

/**
 * A deterministic stand-in for a year of daily counts (Monday 6 Oct 2025 to Monday 28 Sep 2026): busy weekdays, quiet
 * weekends, a swell towards each month's end. A seeded generator, not
 * `Math.random`, so the specimen renders the same on the server and the client
 * and in every screenshot.
 */
function activityDays() {
  const start = Date.UTC(2025, 9, 6);
  let seed = 7;
  const next = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return seed / 4_294_967_296;
  };
  return Array.from({ length: 358 }, (_, i) => {
    const day = new Date(start + i * 86_400_000);
    const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    const monthEnd = 1 + (day.getUTCDate() > 24 ? 0.6 : 0);
    return { date: day.toISOString().slice(0, 10), value: Math.round((weekend ? 3 : 16) * next() * 1.7 * monthEnd) };
  });
}

const ACTIVITY = activityDays();

export function HeatmapSpecimen() {
  return (
    <div className="card p-5">
      <CalendarHeatmap days={ACTIVITY} unit="orders packed" />
    </div>
  );
}

/* ── radar ────────────────────────────────────────────────────────────── */

const CLIENT_PROFILE = [
  { axis: 'Payments', client: 86, segment: 72 },
  { axis: 'Volume', client: 64, segment: 70 },
  { axis: 'Activity', client: 78, segment: 58 },
  { axis: 'Support', client: 52, segment: 66 },
  { axis: 'Growth', client: 71, segment: 49 },
  { axis: 'Loyalty', client: 90, segment: 61 },
];

export function RadarSpecimen() {
  return (
    <div className="card p-5">
      <RadarChart
        data={CLIENT_PROFILE}
        series={[
          { key: 'client', label: 'This client' },
          { key: 'segment', label: 'Segment average' },
        ]}
        max={100}
      />
    </div>
  );
}

/* ── small multiples ──────────────────────────────────────────────────── */

const OFFICE_SERIES = [
  {
    key: 'lahore',
    label: 'Lahore',
    values: [3_100_000, 3_400_000, 3_900_000, 4_300_000, 4_100_000, 4_800_000, 5_100_000, 4_700_000],
  },
  {
    key: 'karachi',
    label: 'Karachi',
    values: [2_800_000, 3_000_000, 3_200_000, 3_100_000, 3_600_000, 3_500_000, 3_900_000, 4_200_000],
  },
  {
    key: 'islamabad',
    label: 'Islamabad',
    values: [1_200_000, 1_500_000, 1_900_000, 2_400_000, 2_300_000, 2_900_000, 3_300_000, 3_800_000],
  },
  {
    key: 'multan',
    label: 'Multan',
    values: [900_000, 800_000, 1_100_000, 1_000_000, 1_300_000, 1_200_000, 1_500_000, 1_400_000],
  },
];
const OFFICE_ROWS = MONTHS.map((month, i) => ({
  month,
  ...Object.fromEntries(OFFICE_SERIES.map((s) => [s.key, s.values[i]!])),
}));

export function SalesComparisonSpecimen() {
  return (
    <div className="card p-5">
      <SmallMultiplesChart
        data={OFFICE_ROWS}
        x="month"
        series={OFFICE_SERIES.map(({ key, label }) => ({ key, label }))}
        format="money"
        formatX={monthLabel}
      />
    </div>
  );
}

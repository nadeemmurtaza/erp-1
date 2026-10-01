/**
 * The whole charting vocabulary for the back office (10-admin-dashboard.md
 * D9). No page or block imports `recharts` directly — everything comes
 * through here, and `scripts/check-chart-imports.mjs` fails the build if
 * one does.
 */
export { TimeSeriesChart, type TimeSeriesSeriesDef } from './time-series-chart';
export { ComparisonChart, type ComparisonBucketPoint } from './comparison-chart';
export { CategoryBarChart, type CategoryBarItem } from './category-bar-chart';
export { ShareChart, type ShareItem } from './share-chart';
export { PeriodComparisonChart, type PeriodComparisonPoint } from './period-comparison-chart';
export { SparklineChart } from './sparkline-chart';
export { ChartDataTable } from './chart-data-table';
export {
  CHART_PALETTE,
  GRID,
  SURFACE,
  INK,
  INK_SOFT,
  INK_FAINT,
  CONTEXT,
  HOVER_WASH,
  POSITIVE,
  NEGATIVE,
  compactRupees,
  compactMoney,
  paletteColor,
  dashFor,
  markerFor,
  type ValueFormat,
} from './chart-theme';

import type { PermissionKey } from '@/constants/permissions';
import type { DashboardGroupKey, ValueFormat } from '@/components/admin/dashboard/card-registry';

/**
 * 25 detail pages are 25 config objects and one catch-all route
 * (10-admin-dashboard.md D3). `analytics/[...slug]/page.tsx` looks the slug
 * up here and renders `<AnalyticsDetailPage>` — there is exactly one
 * detail-page component and one block component per `ReportBlock` kind.
 */

export interface FilterSpec {
  /** The URL query param and the key forwarded to `endpoint`. */
  key: string;
  label: string;
  type: 'select';
  options: readonly { value: string; label: string }[];
}

export type ReportBlock =
  | { kind: 'kpis'; items: ReadonlyArray<{ label: string; path: string; format: ValueFormat; hint?: string }> }
  | {
      kind: 'timeseries';
      title: string;
      path: string;
      x: string;
      chart: 'line' | 'area' | 'bar' | 'stacked-bar';
      series: ReadonlyArray<{ key: string; label: string; format: ValueFormat }>;
    }
  | { kind: 'share'; title: string; path: string; label: string; value: string; format: ValueFormat; drillTo?: string }
  | { kind: 'ranking'; title: string; path: string; label: string; value: string; format: ValueFormat; limit?: number; href?: string }
  | {
      kind: 'table';
      title: string;
      path: string;
      columns: ReadonlyArray<{ key: string; header: string; format: ValueFormat; align?: 'left' | 'right'; href?: string }>;
    }
  | { kind: 'funnel'; title: string; path: string; label: string; value: string }
  | { kind: 'gauge'; title: string; path: string; value: string; target: string }
  | { kind: 'note'; text: string };

export interface AnalyticsReport {
  /** `'sales/revenue'`, no leading slash. */
  slug: string;
  group: DashboardGroupKey;
  title: string;
  description: string;
  permissions: readonly PermissionKey[];
  module?: string;
  /** API path — decoupled from the page path (D4): the owner's page tree need not match the endpoint owner. */
  endpoint: string;
  ranges?: readonly number[];
  /** URL-synced, forwarded to `endpoint` as query params. */
  filters?: readonly FilterSpec[];
  blocks: readonly ReportBlock[];
  /** Another slug, for the breadcrumb chain. */
  parent?: string;
}

export const REPORT_REGISTRY: readonly AnalyticsReport[] = [
  {
    slug: 'sales/revenue',
    group: 'sales',
    title: 'Revenue',
    description: 'Revenue, orders and average order value over time, by channel, against the monthly target.',
    permissions: [],
    endpoint: '/admin/analytics/sales/revenue',
    blocks: [
      {
        kind: 'kpis',
        items: [
          { label: 'Revenue', path: 'totals.revenue', format: 'money' },
          { label: 'Orders', path: 'totals.orders', format: 'integer' },
          { label: 'Average order value', path: 'totals.aov', format: 'money' },
        ],
      },
      {
        kind: 'timeseries',
        title: 'Revenue and orders',
        path: 'series',
        x: 't',
        chart: 'area',
        series: [
          { key: 'revenue', label: 'Revenue', format: 'money' },
          { key: 'orders', label: 'Orders', format: 'integer' },
        ],
      },
      {
        kind: 'share',
        title: 'By channel',
        path: 'byChannel',
        label: 'channel',
        value: 'revenue',
        format: 'money',
      },
      {
        kind: 'gauge',
        title: 'Monthly target',
        path: 'target',
        value: 'target.percentBps',
        target: 'target.amount',
      },
    ],
  },
  {
    slug: 'sales/aov',
    group: 'sales',
    title: 'Average order value',
    description: 'AOV, its median and basket size, plus how order values are distributed.',
    permissions: [],
    endpoint: '/admin/analytics/sales/aov',
    parent: 'sales/revenue',
    blocks: [
      {
        kind: 'kpis',
        items: [
          { label: 'Average order value', path: 'totals.aov', format: 'money' },
          { label: 'Median', path: 'totals.median', format: 'money' },
          { label: 'Basket size (units)', path: 'totals.basketSize', format: 'integer' },
        ],
      },
      {
        kind: 'timeseries',
        title: 'AOV over time',
        path: 'series',
        x: 't',
        chart: 'line',
        series: [{ key: 'aov', label: 'AOV', format: 'money' }],
      },
      {
        kind: 'table',
        title: 'Order value distribution',
        path: 'distribution',
        columns: [
          { key: 'bucket', header: 'Bucket', format: 'text' },
          { key: 'orders', header: 'Orders', format: 'integer', align: 'right' },
        ],
      },
    ],
  },
  {
    slug: 'sales/profit',
    group: 'sales',
    title: 'Gross profit',
    description: 'Direct gross profit — revenue less unit cost — overall, over time, and by product.',
    permissions: ['inventory.view_cost'],
    endpoint: '/admin/analytics/sales/profit',
    parent: 'sales/revenue',
    blocks: [
      {
        kind: 'kpis',
        items: [
          { label: 'Revenue', path: 'totals.revenue', format: 'money' },
          { label: 'Cost of goods', path: 'totals.cogs', format: 'money' },
          { label: 'Gross profit', path: 'totals.grossProfit', format: 'money' },
          { label: 'Gross margin', path: 'totals.grossMarginBps', format: 'percent-bps' },
        ],
      },
      {
        kind: 'timeseries',
        title: 'Revenue, cost and profit',
        path: 'series',
        x: 't',
        chart: 'line',
        series: [
          { key: 'revenue', label: 'Revenue', format: 'money' },
          { key: 'cogs', label: 'Cost', format: 'money' },
          { key: 'grossProfit', label: 'Gross profit', format: 'money' },
        ],
      },
      {
        kind: 'table',
        title: 'By product',
        path: 'byProduct',
        columns: [
          { key: 'name', header: 'Product', format: 'text', href: '/admin/products/{productId}' },
          { key: 'revenue', header: 'Revenue', format: 'money', align: 'right' },
          { key: 'cogs', header: 'Cost', format: 'money', align: 'right' },
          { key: 'grossProfit', header: 'Gross profit', format: 'money', align: 'right' },
          { key: 'marginBps', header: 'Margin', format: 'percent-bps', align: 'right' },
        ],
      },
    ],
  },
  {
    slug: 'sales/funnel',
    group: 'sales',
    title: 'Conversion funnel',
    description: 'View-to-purchase funnel, conversion rate, abandoned carts and traffic sources.',
    permissions: [],
    endpoint: '/admin/analytics/sales/funnel',
    parent: 'sales/revenue',
    blocks: [
      {
        kind: 'kpis',
        items: [
          { label: 'Conversion rate', path: 'conversionBps', format: 'percent-bps' },
          { label: 'Abandoned carts', path: 'abandonedCarts', format: 'integer' },
        ],
      },
      { kind: 'funnel', title: 'Funnel', path: 'steps', label: 'label', value: 'count' },
      { kind: 'share', title: 'Traffic sources', path: 'sources', label: 'source', value: 'count', format: 'integer' },
    ],
  },
  {
    slug: 'orders/overview',
    group: 'orders',
    title: 'Orders overview',
    description: 'Open orders right now — ageing, the oldest worklist, by city and by payment method.',
    permissions: [],
    endpoint: '/admin/analytics/orders/overview',
    blocks: [
      { kind: 'table', title: 'By age', path: 'ageing', columns: [
        { key: 'label', header: 'Age', format: 'text' },
        { key: 'count', header: 'Orders', format: 'integer', align: 'right' },
      ] },
      { kind: 'table', title: 'Oldest open orders', path: 'oldestOpen', columns: [
        { key: 'number', header: 'Order', format: 'text', href: '/admin/orders/{id}' },
        { key: 'status', header: 'Status', format: 'text' },
        { key: 'ageDays', header: 'Age (days)', format: 'integer', align: 'right' },
      ] },
      { kind: 'table', title: 'By city', path: 'byCity', columns: [
        { key: 'city', header: 'City', format: 'text' },
        { key: 'count', header: 'Orders', format: 'integer', align: 'right' },
        { key: 'avgAgeDays', header: 'Avg. age (days)', format: 'days', align: 'right' },
      ] },
    ],
  },
  {
    slug: 'orders/fulfilment',
    group: 'orders',
    title: 'Fulfilment timing',
    description: 'Average and median time spent in each order-status transition.',
    permissions: [],
    endpoint: '/admin/analytics/orders/fulfilment',
    parent: 'orders/overview',
    blocks: [
      {
        kind: 'table',
        title: 'Transitions',
        path: 'transitions',
        columns: [
          { key: 'from', header: 'From', format: 'text' },
          { key: 'to', header: 'To', format: 'text' },
          { key: 'count', header: 'Orders', format: 'integer', align: 'right' },
          { key: 'avgHours', header: 'Avg. hours', format: 'integer', align: 'right' },
          { key: 'medianHours', header: 'Median hours', format: 'integer', align: 'right' },
        ],
      },
    ],
  },

  // Purchasing (Track D — wiring WO-D.2's already-built endpoints into the registry)
  {
    slug: 'purchasing/spend',
    group: 'purchasing',
    title: 'Purchasing spend',
    description: 'What was ordered, received, billed and is still owed to suppliers.',
    permissions: ['inventory.view_cost'],
    endpoint: '/admin/analytics/purchasing/spend',
    blocks: [
      {
        kind: 'kpis',
        items: [
          { label: 'Ordered', path: 'totals.ordered', format: 'money' },
          { label: 'Received', path: 'totals.received', format: 'money' },
          { label: 'Billed', path: 'totals.billed', format: 'money' },
          { label: 'Unpaid', path: 'totals.unpaid', format: 'money' },
        ],
      },
      {
        kind: 'timeseries',
        title: 'Ordered vs. received',
        path: 'series',
        x: 'date',
        chart: 'line',
        series: [
          { key: 'ordered', label: 'Ordered', format: 'money' },
          { key: 'received', label: 'Received', format: 'money' },
        ],
      },
      { kind: 'share', title: 'By category', path: 'byCategory', label: 'category', value: 'spend', format: 'money' },
    ],
  },
  {
    slug: 'purchasing/suppliers',
    group: 'purchasing',
    title: 'Supplier performance',
    description: 'Spend, order count, on-time rate and lead time by supplier.',
    permissions: ['purchasing.manage'],
    endpoint: '/admin/analytics/purchasing/suppliers',
    parent: 'purchasing/spend',
    blocks: [
      {
        kind: 'table',
        title: 'Suppliers',
        path: 'rows',
        columns: [
          { key: 'name', header: 'Supplier', format: 'text', href: '/admin/suppliers/{supplierId}' },
          { key: 'spend', header: 'Spend', format: 'money', align: 'right' },
          { key: 'orders', header: 'Orders', format: 'integer', align: 'right' },
          { key: 'onTimeRateBps', header: 'On-time rate', format: 'percent-bps', align: 'right' },
          { key: 'avgLeadDays', header: 'Avg. lead time', format: 'days', align: 'right' },
          { key: 'share', header: 'Share of spend', format: 'percent-bps', align: 'right' },
          { key: 'avgProductRating', header: 'Product rating', format: 'rating', align: 'right' },
          { key: 'productReviewCount', header: 'Reviews', format: 'integer', align: 'right' },
        ],
      },
    ],
  },

  // Products (Track D — WO-D.3)
  {
    slug: 'products/top-sellers',
    group: 'products',
    title: 'Top sellers',
    description: 'Best-selling products by revenue, with units and margin.',
    permissions: ['catalog.manage'],
    endpoint: '/admin/analytics/products/top-sellers',
    blocks: [
      {
        kind: 'table',
        title: 'Top sellers',
        path: 'rows',
        columns: [
          { key: 'name', header: 'Product', format: 'text', href: '/admin/products/{productId}' },
          { key: 'units', header: 'Units', format: 'integer', align: 'right' },
          { key: 'revenue', header: 'Revenue', format: 'money', align: 'right' },
          { key: 'marginBps', header: 'Margin', format: 'percent-bps', align: 'right' },
        ],
      },
    ],
  },
  {
    slug: 'products/slow-sellers',
    group: 'products',
    title: 'Slow sellers',
    description: 'In-stock, active variants flagged as slow movers, oldest first.',
    permissions: ['catalog.manage'],
    endpoint: '/admin/analytics/products/slow-sellers',
    parent: 'products/top-sellers',
    blocks: [
      {
        kind: 'table',
        title: 'Slow sellers',
        path: 'rows',
        columns: [
          { key: 'name', header: 'Product', format: 'text', href: '/admin/products/{productId}' },
          { key: 'sku', header: 'SKU', format: 'text' },
          { key: 'daysSinceLastSale', header: 'Days since last sale', format: 'days', align: 'right' },
          { key: 'ageDays', header: 'Age (days)', format: 'days', align: 'right' },
        ],
      },
    ],
  },
  {
    slug: 'products/categories',
    group: 'products',
    title: 'Revenue by category',
    description: 'Revenue, units and product count by category, with a daily trend.',
    permissions: ['catalog.manage'],
    endpoint: '/admin/analytics/products/categories',
    parent: 'products/top-sellers',
    blocks: [
      { kind: 'share', title: 'By category', path: 'rows', label: 'name', value: 'revenue', format: 'money' },
      {
        kind: 'timeseries',
        title: 'Revenue over time',
        path: 'series',
        x: 'date',
        chart: 'area',
        series: [{ key: 'revenue', label: 'Revenue', format: 'money' }],
      },
    ],
  },

  // Inventory (Track D — WO-D.4)
  {
    slug: 'inventory/valuation',
    group: 'inventory',
    title: 'Inventory valuation',
    description: 'What the stock on hand is worth right now, by category, kind and age.',
    permissions: ['inventory.view_cost'],
    endpoint: '/admin/analytics/inventory/valuation',
    blocks: [
      {
        kind: 'kpis',
        items: [
          { label: 'Units on hand', path: 'totals.units', format: 'integer' },
          { label: 'Value', path: 'totals.value', format: 'money' },
          { label: 'Unknown cost', path: 'totals.unknownCostVariants', format: 'integer', hint: 'In-stock variants never received against a purchase order.' },
        ],
      },
      { kind: 'share', title: 'By category', path: 'byCategory', label: 'name', value: 'value', format: 'money' },
      {
        kind: 'table',
        title: 'By kind',
        path: 'byKind',
        columns: [
          { key: 'kind', header: 'Kind', format: 'text' },
          { key: 'units', header: 'Units', format: 'integer', align: 'right' },
          { key: 'value', header: 'Value', format: 'money', align: 'right' },
        ],
      },
      {
        kind: 'table',
        title: 'By age',
        path: 'ageing',
        columns: [
          { key: 'label', header: 'Age', format: 'text' },
          { key: 'units', header: 'Units', format: 'integer', align: 'right' },
          { key: 'value', header: 'Value', format: 'money', align: 'right' },
        ],
      },
    ],
  },
  {
    slug: 'inventory/movements',
    group: 'inventory',
    title: 'Stock movements',
    description: 'Stock movement volume by day and reason, plus the most recent individual movements.',
    permissions: ['inventory.manage'],
    endpoint: '/admin/analytics/inventory/movements',
    parent: 'inventory/valuation',
    blocks: [
      {
        kind: 'timeseries',
        title: 'In vs. out',
        path: 'series',
        x: 'date',
        chart: 'stacked-bar',
        series: [
          { key: 'in', label: 'In', format: 'integer' },
          { key: 'out', label: 'Out', format: 'integer' },
        ],
      },
      {
        kind: 'table',
        title: 'By reason',
        path: 'byReason',
        columns: [
          { key: 'reason', header: 'Reason', format: 'text' },
          { key: 'in', header: 'In', format: 'integer', align: 'right' },
          { key: 'out', header: 'Out', format: 'integer', align: 'right' },
        ],
      },
    ],
  },

  // Customers (Track D — WO-D.5)
  {
    slug: 'customers/overview',
    group: 'customers',
    title: 'Customers overview',
    description: 'The customer book — totals, by city, by acquisition source, by lifecycle status.',
    permissions: ['crm.manage'],
    endpoint: '/admin/analytics/customers/overview',
    blocks: [
      {
        kind: 'kpis',
        items: [
          { label: 'Total customers', path: 'totals.total', format: 'integer' },
          { label: 'Repeat', path: 'totals.repeat', format: 'integer' },
          { label: 'New this month', path: 'totals.newThisMonth', format: 'integer' },
        ],
      },
      { kind: 'share', title: 'By status', path: 'byStatus', label: 'status', value: 'count', format: 'integer' },
      {
        kind: 'table',
        title: 'By city',
        path: 'byCity',
        columns: [
          { key: 'city', header: 'City', format: 'text' },
          { key: 'count', header: 'Customers', format: 'integer', align: 'right' },
        ],
      },
    ],
  },
  {
    slug: 'customers/retention',
    group: 'customers',
    title: 'Retention',
    description: 'Signup cohorts and how many of each went on to order again, plus the overall repeat rate.',
    permissions: ['crm.manage'],
    endpoint: '/admin/analytics/customers/retention',
    parent: 'customers/overview',
    blocks: [
      { kind: 'kpis', items: [{ label: 'Repeat rate', path: 'repeatRateBps', format: 'percent-bps' }] },
      {
        kind: 'table',
        title: 'Cohorts',
        path: 'cohorts',
        columns: [
          { key: 'cohort', header: 'Signup month', format: 'text' },
          { key: 'size', header: 'Size', format: 'integer', align: 'right' },
          { key: 'retained', header: 'Retained', format: 'integer', align: 'right' },
        ],
      },
    ],
  },
  {
    slug: 'customers/top',
    group: 'customers',
    title: 'Top customers',
    description: 'The highest-lifetime-value customers.',
    permissions: ['crm.manage'],
    endpoint: '/admin/analytics/customers/top',
    parent: 'customers/overview',
    blocks: [
      {
        kind: 'table',
        title: 'Top customers',
        path: 'rows',
        columns: [
          { key: 'name', header: 'Customer', format: 'text', href: '/admin/customers/{contactId}' },
          { key: 'city', header: 'City', format: 'text' },
          { key: 'orders', header: 'Orders', format: 'integer', align: 'right' },
          { key: 'lifetimeValue', header: 'Lifetime value', format: 'money', align: 'right' },
          { key: 'avgOrderValue', header: 'Avg. order value', format: 'money', align: 'right' },
        ],
      },
    ],
  },

  // Workshop & Users (Track D — WO-D.6)
  {
    slug: 'workshop/output',
    group: 'workshop',
    title: 'Workshop output',
    description: 'Throughput — started/completed per day, time in each stage, output by tailor, the bottleneck stage.',
    permissions: ['stitching.jobs.view_queue'],
    endpoint: '/admin/analytics/workshop/output',
    blocks: [
      {
        kind: 'kpis',
        items: [
          { label: 'Bottleneck stage', path: 'bottleneck.stage', format: 'text' },
          { label: 'Bottleneck avg. hours', path: 'bottleneck.avgHours', format: 'integer' },
        ],
      },
      {
        kind: 'timeseries',
        title: 'Started vs. completed',
        path: 'series',
        x: 'date',
        chart: 'line',
        series: [
          { key: 'started', label: 'Started', format: 'integer' },
          { key: 'completed', label: 'Completed', format: 'integer' },
        ],
      },
      {
        kind: 'table',
        title: 'By stage',
        path: 'byStage',
        columns: [
          { key: 'stage', header: 'Stage', format: 'text' },
          { key: 'count', header: 'Jobs', format: 'integer', align: 'right' },
          { key: 'avgHours', header: 'Avg. hours', format: 'integer', align: 'right' },
        ],
      },
      {
        kind: 'table',
        title: 'By tailor',
        path: 'byTailor',
        columns: [
          { key: 'name', header: 'Tailor', format: 'text' },
          { key: 'jobsCompleted', header: 'Completed', format: 'integer', align: 'right' },
          { key: 'avgHours', header: 'Avg. hours', format: 'integer', align: 'right' },
        ],
      },
    ],
  },

  // Expenses (Track B — wiring WO-B.4's already-built endpoints into the registry)
  {
    slug: 'expenses/summary',
    group: 'expenses',
    title: 'Expenses summary',
    description: 'Total expenses, by category, and the daily trend.',
    permissions: ['finance.view'],
    module: 'finance',
    endpoint: '/admin/finance/expenses/summary',
    blocks: [
      {
        kind: 'kpis',
        items: [
          { label: 'Total', path: 'totals.amount', format: 'money' },
          { label: 'Direct', path: 'totals.directAmount', format: 'money' },
          { label: 'Operating', path: 'totals.operatingAmount', format: 'money' },
          { label: 'Unpaid', path: 'totals.unpaidAmount', format: 'money' },
        ],
      },
      {
        kind: 'timeseries',
        title: 'Daily expenses',
        path: 'series',
        x: 'date',
        chart: 'area',
        series: [{ key: 'amount', label: 'Amount', format: 'money' }],
      },
    ],
  },
  {
    slug: 'expenses/by-category',
    group: 'expenses',
    title: 'Expenses by category',
    description: "Each category's share of spend, and its change versus the previous period.",
    permissions: ['finance.view'],
    module: 'finance',
    endpoint: '/admin/finance/expenses/by-category',
    parent: 'expenses/summary',
    blocks: [
      { kind: 'kpis', items: [{ label: 'Vs. revenue', path: 'vsRevenueBps', format: 'percent-bps' }] },
      { kind: 'share', title: 'By category', path: 'rows', label: 'name', value: 'amount', format: 'money' },
      {
        kind: 'table',
        title: 'Categories',
        path: 'rows',
        columns: [
          { key: 'name', header: 'Category', format: 'text' },
          { key: 'amount', header: 'Amount', format: 'money', align: 'right' },
          { key: 'shareBps', header: 'Share', format: 'percent-bps', align: 'right' },
          { key: 'changeBps', header: 'Change', format: 'percent-bps', align: 'right' },
        ],
      },
    ],
  },
  {
    slug: 'expenses/trend',
    group: 'expenses',
    title: 'Expenses trend',
    description: 'Direct and operating expenses over time.',
    permissions: ['finance.view'],
    module: 'finance',
    endpoint: '/admin/finance/expenses/trend',
    parent: 'expenses/summary',
    blocks: [
      {
        kind: 'timeseries',
        title: 'Direct vs. operating',
        path: 'series',
        x: 't',
        chart: 'stacked-bar',
        series: [
          { key: 'direct', label: 'Direct', format: 'money' },
          { key: 'operating', label: 'Operating', format: 'money' },
        ],
      },
    ],
  },
] as const;

/** Looks a slug up — `undefined` for an unregistered one, never a throw (the catch-all route renders `not-found.tsx` on that). */
export function reportFor(slug: string): AnalyticsReport | undefined {
  return REPORT_REGISTRY.find((report) => report.slug === slug);
}

/** Every report whose `module` (when set) is enabled — the report index's own list, same shape as `cardsFor()`. */
export function reportsFor(enabledModules: readonly string[]): AnalyticsReport[] {
  return REPORT_REGISTRY.filter((report) => !report.module || enabledModules.includes(report.module));
}

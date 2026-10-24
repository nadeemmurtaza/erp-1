import type { PermissionKey } from '@/constants/permissions';
import { ROUTES } from '@/constants/routes';

/**
 * A dashboard card is a registry entry, never a component
 * (10-admin-dashboard.md D1) — mirrors `nav-registry.ts`, which this
 * codebase already proves out. There is exactly one card component,
 * `metric-card.tsx`; adding a card is one object literal here.
 *
 * Group key deviation from the brief: D1's own `DASHBOARD_GROUPS` literal
 * names the ninth group `manufacturing`, but every metric key in that
 * group is prefixed `bom.` (`bom.active_recipes`, …) — the same prefix
 * `MetricRegistryService.keysForGroups()` (WO-A.3) uses to resolve a
 * `groups=` query param straight from the registered key namespace, with
 * no second hand-kept group→prefix map to drift from it. Renamed the key
 * to `bom` so that mapping stays a pure, un-special-cased prefix match.
 * Label and href are unchanged from the brief.
 */
export const DASHBOARD_GROUPS = [
  { key: 'sales', label: 'Sales', icon: 'TrendingUp', href: ROUTES.admin.analyticsReport('sales') },
  { key: 'orders', label: 'Orders', icon: 'ShoppingCart', href: ROUTES.admin.analyticsReport('orders') },
  { key: 'purchasing', label: 'Purchasing', icon: 'Truck', href: ROUTES.admin.analyticsReport('purchasing') },
  { key: 'products', label: 'Products', icon: 'Package', href: ROUTES.admin.analyticsReport('products') },
  { key: 'inventory', label: 'Inventory', icon: 'Boxes', href: ROUTES.admin.analyticsReport('inventory') },
  { key: 'expenses', label: 'Expenses', icon: 'Wallet', href: ROUTES.admin.analyticsReport('expenses') },
  { key: 'bom', label: 'BOM & Manufacturing', icon: 'Factory', href: ROUTES.admin.bom },
  { key: 'customers', label: 'Customers', icon: 'Users', href: ROUTES.admin.analyticsReport('customers') },
  { key: 'workshop', label: 'Workshop & Users', icon: 'Scissors', href: ROUTES.admin.analyticsReport('workshop') },
] as const;

export type DashboardGroupKey = (typeof DASHBOARD_GROUPS)[number]['key'];

/** Matches `MetricValue.unit` 1:1, plus the client-only rendering choices `unit` alone can't express (a raw 0-100 percent vs. bps, a text-only card). */
export type ValueFormat = 'money' | 'integer' | 'percent' | 'percent-bps' | 'days' | 'rating' | 'text';

export interface DashboardCard {
  /** Stable; also the deep-link fragment. */
  key: string;
  group: DashboardGroupKey;
  label: string;
  /** Key into the `metrics` map `GET /admin/analytics/cards` returns. */
  metric: string;
  format: ValueFormat;
  href: string;
  /** Any ONE of these is enough. */
  permissions?: readonly PermissionKey[];
  /** Hidden when this API module is off. */
  module?: string;
  tone?: 'up-good' | 'up-bad' | 'neutral';
  /** Key into the `series` map — only the six D1 names. */
  sparkline?: string;
  hint?: string;
}

export const DASHBOARD_CARDS: readonly DashboardCard[] = [
  // Sales
  {
    key: 'sales.revenue',
    group: 'sales',
    label: 'Revenue',
    metric: 'sales.revenue',
    format: 'money',
    href: ROUTES.admin.analyticsReport('sales/revenue'),
    sparkline: 'revenue',
  },
  {
    key: 'sales.aov',
    group: 'sales',
    label: 'Average order value',
    metric: 'sales.aov',
    format: 'money',
    href: ROUTES.admin.analyticsReport('sales/aov'),
  },
  {
    key: 'sales.gross_profit',
    group: 'sales',
    label: 'Gross profit',
    metric: 'sales.gross_profit',
    format: 'money',
    href: ROUTES.admin.analyticsReport('sales/profit'),
    permissions: ['inventory.view_cost'],
  },
  {
    key: 'sales.gross_margin_bps',
    group: 'sales',
    label: 'Gross margin',
    metric: 'sales.gross_margin_bps',
    format: 'percent-bps',
    href: ROUTES.admin.analyticsReport('sales/profit'),
    permissions: ['inventory.view_cost'],
  },
  {
    key: 'sales.conversion_rate',
    group: 'sales',
    label: 'Conversion rate',
    metric: 'sales.conversion_rate',
    format: 'percent',
    href: ROUTES.admin.analyticsReport('sales/funnel'),
    hint: 'Orders placed ÷ carts that ever held an item, this window.',
  },
  {
    key: 'sales.target_progress_bps',
    group: 'sales',
    label: 'Monthly target',
    metric: 'sales.target_progress_bps',
    format: 'percent-bps',
    href: ROUTES.admin.analyticsReport('sales/revenue'),
    hint: 'Always the current calendar month, regardless of the range above.',
  },

  // Orders
  {
    key: 'orders.total',
    group: 'orders',
    label: 'Total orders',
    metric: 'orders.total',
    format: 'integer',
    href: ROUTES.admin.analyticsReport('orders/overview'),
    sparkline: 'orders',
  },
  {
    key: 'orders.pending',
    group: 'orders',
    label: 'Pending',
    metric: 'orders.pending',
    format: 'integer',
    href: `${ROUTES.admin.orders}?status=PENDING`,
    hint: 'Not yet confirmed.',
  },
  {
    key: 'orders.confirmed',
    group: 'orders',
    label: 'Confirmed',
    metric: 'orders.confirmed',
    format: 'integer',
    href: `${ROUTES.admin.orders}?status=CONFIRMED`,
  },
  {
    key: 'orders.processing',
    group: 'orders',
    label: 'Processing',
    metric: 'orders.processing',
    format: 'integer',
    href: `${ROUTES.admin.orders}?status=PROCESSING`,
  },
  {
    key: 'orders.ready_to_ship',
    group: 'orders',
    label: 'Ready to ship',
    metric: 'orders.ready_to_ship',
    format: 'integer',
    href: `${ROUTES.admin.orders}?status=READY_TO_SHIP`,
  },
  {
    key: 'orders.shipped',
    group: 'orders',
    label: 'Shipped',
    metric: 'orders.shipped',
    format: 'integer',
    href: `${ROUTES.admin.orders}?status=SHIPPED`,
  },
  {
    key: 'orders.delivered',
    group: 'orders',
    label: 'Delivered',
    metric: 'orders.delivered',
    format: 'integer',
    href: `${ROUTES.admin.orders}?status=DELIVERED`,
  },
  {
    key: 'orders.cancelled',
    group: 'orders',
    label: 'Cancelled',
    metric: 'orders.cancelled',
    format: 'integer',
    href: `${ROUTES.admin.orders}?status=CANCELLED`,
    tone: 'up-bad',
  },
  {
    key: 'orders.returned',
    group: 'orders',
    label: 'Returned',
    metric: 'orders.returned',
    format: 'integer',
    href: `${ROUTES.admin.orders}?status=RETURNED`,
    tone: 'up-bad',
  },
  {
    key: 'orders.avg_fulfilment_days',
    group: 'orders',
    label: 'Avg. fulfilment time',
    metric: 'orders.avg_fulfilment_days',
    format: 'days',
    href: ROUTES.admin.analyticsReport('orders/fulfilment'),
    tone: 'up-bad',
  },

  // Expenses
  {
    key: 'expenses.total',
    group: 'expenses',
    label: 'Total expenses',
    metric: 'expenses.total',
    format: 'money',
    href: ROUTES.admin.analyticsReport('expenses/summary'),
    module: 'finance',
    permissions: ['finance.view'],
    sparkline: 'expenses',
  },
  {
    key: 'expenses.largest_category_amount',
    group: 'expenses',
    label: 'Largest category',
    metric: 'expenses.largest_category_amount',
    format: 'money',
    href: ROUTES.admin.analyticsReport('expenses/by-category'),
    module: 'finance',
    permissions: ['finance.view'],
  },
  {
    key: 'expenses.unpaid_count',
    group: 'expenses',
    label: 'Unpaid expenses',
    metric: 'expenses.unpaid_count',
    format: 'integer',
    href: ROUTES.admin.financeExpenses,
    module: 'finance',
    permissions: ['finance.view'],
  },
  {
    key: 'expenses.unpaid_amount',
    group: 'expenses',
    label: 'Unpaid amount',
    metric: 'expenses.unpaid_amount',
    format: 'money',
    href: ROUTES.admin.financeExpenses,
    module: 'finance',
    permissions: ['finance.view'],
  },
  {
    key: 'expenses.direct_share_bps',
    group: 'expenses',
    label: 'Direct cost share',
    metric: 'expenses.direct_share_bps',
    format: 'percent-bps',
    href: ROUTES.admin.analyticsReport('expenses/by-category'),
    module: 'finance',
    permissions: ['finance.view'],
  },
  {
    key: 'expenses.vs_revenue_bps',
    group: 'expenses',
    label: 'Expenses vs. revenue',
    metric: 'expenses.vs_revenue_bps',
    format: 'percent-bps',
    href: ROUTES.admin.analyticsReport('expenses/trend'),
    module: 'finance',
    permissions: ['finance.view'],
    tone: 'up-bad',
  },
  {
    key: 'expenses.recurring_due_count',
    group: 'expenses',
    label: 'Recurring due',
    metric: 'expenses.recurring_due_count',
    format: 'integer',
    href: ROUTES.admin.financeExpenses,
    module: 'finance',
    permissions: ['finance.view'],
  },

  // Purchasing
  {
    key: 'purchasing.open_pos',
    group: 'purchasing',
    label: 'Open purchase orders',
    metric: 'purchasing.open_pos',
    format: 'integer',
    href: `${ROUTES.admin.purchaseOrders}?status=DRAFT`,
    permissions: ['purchasing.manage'],
  },
  {
    key: 'purchasing.awaiting_transit',
    group: 'purchasing',
    label: 'Awaiting transit',
    metric: 'purchasing.awaiting_transit',
    format: 'integer',
    href: `${ROUTES.admin.purchaseOrders}?status=SENT`,
    permissions: ['purchasing.manage'],
  },
  {
    key: 'purchasing.partial',
    group: 'purchasing',
    label: 'Partially received',
    metric: 'purchasing.partial',
    format: 'integer',
    href: `${ROUTES.admin.purchaseOrders}?status=PARTIAL`,
    permissions: ['purchasing.manage'],
  },
  {
    key: 'purchasing.spend',
    group: 'purchasing',
    label: 'Spend (received)',
    metric: 'purchasing.spend',
    format: 'money',
    href: ROUTES.admin.analyticsReport('purchasing/spend'),
    permissions: ['inventory.view_cost'],
    sparkline: 'purchases',
  },
  {
    key: 'purchasing.unpaid_bills_amount',
    group: 'purchasing',
    label: 'Unpaid bills',
    metric: 'purchasing.unpaid_bills_amount',
    format: 'money',
    href: ROUTES.admin.analyticsReport('purchasing/suppliers'),
    permissions: ['purchasing.manage'],
  },
  {
    key: 'purchasing.overdue_bills',
    group: 'purchasing',
    label: 'Overdue bills',
    metric: 'purchasing.overdue_bills',
    format: 'integer',
    href: ROUTES.admin.analyticsReport('purchasing/suppliers'),
    permissions: ['purchasing.manage'],
    tone: 'up-bad',
  },
  {
    key: 'purchasing.top_supplier_share_bps',
    group: 'purchasing',
    label: 'Top supplier share',
    metric: 'purchasing.top_supplier_share_bps',
    format: 'percent-bps',
    href: ROUTES.admin.analyticsReport('purchasing/suppliers'),
    permissions: ['purchasing.manage'],
  },

  // Products
  {
    key: 'products.total',
    group: 'products',
    label: 'Total products',
    metric: 'products.total',
    format: 'integer',
    href: ROUTES.admin.products,
    permissions: ['catalog.manage'],
  },
  {
    key: 'products.active',
    group: 'products',
    label: 'Active',
    metric: 'products.active',
    format: 'integer',
    href: `${ROUTES.admin.products}?status=ACTIVE`,
    permissions: ['catalog.manage'],
  },
  {
    key: 'products.draft',
    group: 'products',
    label: 'Draft',
    metric: 'products.draft',
    format: 'integer',
    href: `${ROUTES.admin.products}?status=DRAFT`,
    permissions: ['catalog.manage'],
  },
  {
    key: 'products.top_seller_units',
    group: 'products',
    label: 'Top seller',
    metric: 'products.top_seller_units',
    format: 'integer',
    href: ROUTES.admin.analyticsReport('products/top-sellers'),
    permissions: ['catalog.manage'],
  },
  {
    key: 'products.slowest_seller_units',
    group: 'products',
    label: 'Slowest seller',
    metric: 'products.slowest_seller_units',
    format: 'integer',
    href: ROUTES.admin.analyticsReport('products/slow-sellers'),
    permissions: ['catalog.manage'],
  },
  {
    key: 'products.out_of_stock_variants',
    group: 'products',
    label: 'Out of stock variants',
    metric: 'products.out_of_stock_variants',
    format: 'integer',
    href: `${ROUTES.admin.inventory}?filter=out-of-stock`,
    permissions: ['catalog.manage'],
    tone: 'up-bad',
  },
  {
    key: 'products.low_stock_variants',
    group: 'products',
    label: 'Low stock variants',
    metric: 'products.low_stock_variants',
    format: 'integer',
    href: `${ROUTES.admin.inventory}?filter=low-stock`,
    permissions: ['catalog.manage'],
    tone: 'up-bad',
  },
  {
    key: 'products.no_sales_in_window',
    group: 'products',
    label: 'No sales this window',
    metric: 'products.no_sales_in_window',
    format: 'integer',
    href: ROUTES.admin.analyticsReport('products/slow-sellers'),
    permissions: ['catalog.manage'],
  },

  // Inventory
  {
    key: 'inventory.valuation',
    group: 'inventory',
    label: 'Inventory valuation',
    metric: 'inventory.valuation',
    format: 'money',
    href: ROUTES.admin.analyticsReport('inventory/valuation'),
    permissions: ['inventory.view_cost'],
  },
  {
    key: 'inventory.units_on_hand',
    group: 'inventory',
    label: 'Units on hand',
    metric: 'inventory.units_on_hand',
    format: 'integer',
    href: ROUTES.admin.inventory,
    permissions: ['inventory.manage'],
  },
  {
    key: 'inventory.out_of_stock',
    group: 'inventory',
    label: 'Out of stock',
    metric: 'inventory.out_of_stock',
    format: 'integer',
    href: `${ROUTES.admin.inventory}?filter=out-of-stock`,
    permissions: ['inventory.manage'],
    tone: 'up-bad',
  },
  {
    key: 'inventory.low_stock',
    group: 'inventory',
    label: 'Low stock',
    metric: 'inventory.low_stock',
    format: 'integer',
    href: `${ROUTES.admin.inventory}?filter=low-stock`,
    permissions: ['inventory.manage'],
    tone: 'up-bad',
  },
  {
    key: 'inventory.slow_movers',
    group: 'inventory',
    label: 'Slow movers',
    metric: 'inventory.slow_movers',
    format: 'integer',
    href: ROUTES.admin.inventorySlowMovers,
    permissions: ['inventory.manage'],
  },
  {
    key: 'inventory.dead_stock',
    group: 'inventory',
    label: 'Dead stock',
    metric: 'inventory.dead_stock',
    format: 'integer',
    href: `${ROUTES.admin.inventory}?filter=dead-stock`,
    permissions: ['inventory.manage'],
  },
  {
    key: 'inventory.movements_in_window',
    group: 'inventory',
    label: 'Stock movements',
    metric: 'inventory.movements_in_window',
    format: 'integer',
    href: ROUTES.admin.analyticsReport('inventory/movements'),
    permissions: ['inventory.manage'],
  },
  {
    key: 'inventory.reorder_suggestions',
    group: 'inventory',
    label: 'Reorder suggestions',
    metric: 'inventory.reorder_suggestions',
    format: 'integer',
    href: ROUTES.admin.inventoryReorder,
    permissions: ['inventory.manage'],
  },

  // BOM & Manufacturing
  {
    key: 'bom.active_recipes',
    group: 'bom',
    label: 'Active recipes',
    metric: 'bom.active_recipes',
    format: 'integer',
    href: ROUTES.admin.bom,
    module: 'bom',
    permissions: ['bom.view'],
  },
  {
    key: 'bom.missing_recipes',
    group: 'bom',
    label: 'Missing recipes',
    metric: 'bom.missing_recipes',
    format: 'integer',
    href: `${ROUTES.admin.bom}?filter=missing`,
    module: 'bom',
    permissions: ['bom.view'],
    tone: 'up-bad',
  },
  {
    key: 'bom.incomplete_cost_recipes',
    group: 'bom',
    label: 'Incomplete cost',
    metric: 'bom.incomplete_cost_recipes',
    format: 'integer',
    href: `${ROUTES.admin.bom}?filter=incomplete-cost`,
    module: 'bom',
    permissions: ['bom.view'],
    tone: 'up-bad',
  },
  {
    key: 'bom.production_runs',
    group: 'bom',
    label: 'Production runs',
    metric: 'bom.production_runs',
    format: 'integer',
    href: `${ROUTES.admin.bom}/production`,
    module: 'bom',
    permissions: ['bom.view'],
  },
  {
    key: 'bom.units_produced',
    group: 'bom',
    label: 'Units produced',
    metric: 'bom.units_produced',
    format: 'integer',
    href: `${ROUTES.admin.bom}/production`,
    module: 'bom',
    permissions: ['bom.view'],
    sparkline: 'units_produced',
  },
  {
    key: 'bom.raw_material_value',
    group: 'bom',
    label: 'Raw material value',
    metric: 'bom.raw_material_value',
    format: 'money',
    href: `${ROUTES.admin.bom}/raw-materials`,
    module: 'bom',
    permissions: ['inventory.view_cost'],
  },
  {
    key: 'bom.raw_materials_low_stock',
    group: 'bom',
    label: 'Raw materials low',
    metric: 'bom.raw_materials_low_stock',
    format: 'integer',
    href: `${ROUTES.admin.bom}/raw-materials?filter=low-stock`,
    module: 'bom',
    permissions: ['bom.view'],
    tone: 'up-bad',
  },

  // Customers
  {
    key: 'customers.total',
    group: 'customers',
    label: 'Total customers',
    metric: 'customers.total',
    format: 'integer',
    href: ROUTES.admin.contacts,
    permissions: ['crm.manage'],
  },
  {
    key: 'customers.new',
    group: 'customers',
    label: 'New customers',
    metric: 'customers.new',
    format: 'integer',
    href: ROUTES.admin.analyticsReport('customers/overview'),
    permissions: ['crm.manage'],
    sparkline: 'new_customers',
  },
  {
    key: 'customers.repeat',
    group: 'customers',
    label: 'Repeat customers',
    metric: 'customers.repeat',
    format: 'integer',
    href: ROUTES.admin.analyticsReport('customers/retention'),
    permissions: ['crm.manage'],
  },
  {
    key: 'customers.repeat_rate_bps',
    group: 'customers',
    label: 'Repeat rate',
    metric: 'customers.repeat_rate_bps',
    format: 'percent-bps',
    href: ROUTES.admin.analyticsReport('customers/retention'),
    permissions: ['crm.manage'],
  },
  {
    key: 'customers.top_spender_ltv',
    group: 'customers',
    label: 'Top spender (LTV)',
    metric: 'customers.top_spender_ltv',
    format: 'money',
    href: ROUTES.admin.analyticsReport('customers/top'),
    permissions: ['crm.manage'],
  },
  {
    key: 'customers.open_leads',
    group: 'customers',
    label: 'Open leads',
    metric: 'customers.open_leads',
    format: 'integer',
    href: ROUTES.admin.leads,
    permissions: ['crm.manage'],
  },
  {
    key: 'customers.follow_ups_due',
    group: 'customers',
    label: 'Follow-ups due',
    metric: 'customers.follow_ups_due',
    format: 'integer',
    href: ROUTES.admin.contacts,
    permissions: ['crm.manage'],
  },

  // Workshop & Users
  {
    key: 'workshop.active_jobs',
    group: 'workshop',
    label: 'Active jobs',
    metric: 'workshop.active_jobs',
    format: 'integer',
    href: ROUTES.admin.stitching,
    permissions: ['stitching.jobs.view_queue'],
  },
  {
    key: 'workshop.jobs_completed',
    group: 'workshop',
    label: 'Jobs completed',
    metric: 'workshop.jobs_completed',
    format: 'integer',
    href: ROUTES.admin.analyticsReport('workshop/output'),
    permissions: ['stitching.jobs.view_queue'],
  },
  {
    key: 'workshop.bottleneck_stage',
    group: 'workshop',
    label: 'Bottleneck stage',
    metric: 'workshop.bottleneck_stage',
    format: 'text',
    href: ROUTES.admin.analyticsReport('workshop/output'),
    permissions: ['stitching.jobs.view_queue'],
  },
  {
    key: 'workshop.avg_job_days',
    group: 'workshop',
    label: 'Avg. job time',
    metric: 'workshop.avg_job_days',
    format: 'days',
    href: ROUTES.admin.analyticsReport('workshop/output'),
    permissions: ['stitching.jobs.view_queue'],
  },
  {
    key: 'workshop.staff_accounts',
    group: 'workshop',
    label: 'Staff accounts',
    metric: 'workshop.staff_accounts',
    format: 'integer',
    href: ROUTES.admin.users,
    permissions: ['users.manage'],
  },
  {
    key: 'workshop.active_tailors',
    group: 'workshop',
    label: 'Active tailors',
    metric: 'workshop.active_tailors',
    format: 'integer',
    href: ROUTES.admin.stitching,
    permissions: ['stitching.jobs.view_queue'],
  },
] as const;

/**
 * The visible cards for a caller: any card whose `module` (when set) is
 * enabled. Deviation from D1's own `cardsFor(permissions, enabledModules)`
 * signature: this takes only `enabledModules`, because permission is
 * deliberately NOT a visibility filter here — D1's own acceptance criterion
 * a few lines later says "a zero and 'you may not see this' must never look
 * the same," which only holds if the lacking-permission card still renders
 * (as an em-dash, in `metric-card.tsx`, via `useAdminSession().can()`)
 * rather than disappearing. Only a missing MODULE removes a card outright —
 * the design system's own rule (`PRM-5`/`MOD-1`): a permission gap reflows
 * within the card, a module gap reflows the grid.
 */
export function cardsFor(enabledModules: readonly string[]): DashboardCard[] {
  return DASHBOARD_CARDS.filter((card) => !card.module || enabledModules.includes(card.module));
}

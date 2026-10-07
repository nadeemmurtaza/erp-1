import type { PermissionKey } from '@newax/shared';
import { isModuleEnabled } from '@/utils/module-gate';

import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Scissors,
  Users,
  BarChart3,
  Settings,
  Factory,
  Wallet,
  Landmark,
  Truck,
  TrendingUp,
  Building2,
} from 'lucide-react';

export const ICON_MAP = {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Scissors,
  Users,
  BarChart3,
  Settings,
  Factory,
  Wallet,
  Landmark,
  Truck,
  TrendingUp,
  Building2,
} as const;

export interface AdminNavGroup {
  key: AdminNavItem['group'];
  label: string;
  /** lucide-react icon name. */
  icon: keyof typeof ICON_MAP;
}

/**
 * Sidebar order is THIS ARRAY's order. Nothing else decides it.
 *
 * Named for the work, not for the tables behind it. The previous eleven
 * groups tracked the API's module list — Sales, Fulfilment, Inventory &
 * Supply, Marketing, Finance — and three of them ("fulfilment", "marketing",
 * "finance") had no items at all, so the sidebar drew three headings over
 * nothing. Eight groups, each one something somebody actually sits down to
 * do: see what needs attention, take orders, make garments, talk to
 * customers, decide what is sold, keep stock, understand the numbers, set
 * the place up.
 */
export const NAV_GROUPS: readonly AdminNavGroup[] = [
  { key: 'overview',  label: 'Overview',  icon: 'LayoutDashboard' },
  { key: 'orders',    label: 'Orders',    icon: 'ShoppingCart' },
  { key: 'workshop',  label: 'Workshop',  icon: 'Scissors' },
  { key: 'customers', label: 'Customers', icon: 'Users' },
  { key: 'catalogue', label: 'Catalogue', icon: 'Package' },
  { key: 'stock',     label: 'Stock',     icon: 'Boxes' },
  { key: 'manufacturing', label: 'Manufacturing', icon: 'Factory' },
  { key: 'payroll', label: 'Payroll', icon: 'Wallet' },
  // hr-people-org/19-org-structure-offices-departments.md — "a new
  // organization nav group," the doc's own explicit instruction: offices,
  // regions and departments are not payroll, and every later hr-people-org
  // document (postings, attendance, tasks) hangs off this same tree.
  { key: 'organization', label: 'Organization', icon: 'Building2' },
  // Reinstated (WO-4.5, 04-finance.md) — removed in the eleven-to-eight-group
  // cut above for having zero items, not for being wrong in principle. It
  // now has six: P&L, expenses (+ its own two children), margins, cash flow,
  // unit economics — a real destination again, not an empty heading.
  { key: 'finance', label: 'Finance', icon: 'Landmark' },
  // Reinstated (WO-6.8, 06-shipping-fulfilment-returns.md) — one of the same
  // three zero-item groups the eleven-to-eight cut removed (its own comment
  // above names it alongside marketing and finance). Now has four: shipments,
  // manifests, tracking, RTO.
  { key: 'fulfilment', label: 'Fulfilment', icon: 'Truck' },
  { key: 'insights',  label: 'Insights',  icon: 'BarChart3' },
  { key: 'settings',  label: 'Settings',  icon: 'Settings' },
] as const;

export interface AdminNavItem {
  /** Stable key, matching the API module that owns the section. */
  key: string;
  label: string;
  href: string;
  /** Permissions that unlock this entry — any one is enough. Omit for everyone signed in. */
  permissions?: readonly PermissionKey[];
  group:
    | 'overview'
    | 'orders'
    | 'workshop'
    | 'customers'
    | 'catalogue'
    | 'stock'
    | 'manufacturing'
    | 'payroll'
    | 'organization'
    | 'finance'
    | 'fulfilment'
    | 'insights'
    | 'settings';
  /** lucide-react icon name. */
  icon?: string;
  /** One level of nesting. Do not nest deeper. */
  children?: readonly AdminNavItem[];
  /** API module that owns this. Hidden when the module is off in MODULES. */
  module?: string;
}

/**
 * The admin navigation, as data.
 *
 * ADDING A SECTION IS ONE ENTRY HERE. The shell renders whatever is registered
 * and filters by the signed-in user's permissions, so a new module (orders,
 * CRM, the tailor queue) adds its screens without touching the layout — the
 * same one-line rule the API's module registry follows.
 *
 * What each item requires is a capability, not a role — which roles
 * currently hold that capability is data (RolePermission), editable from
 * /admin/settings, not something this file encodes.
 */
export const ADMIN_NAV: AdminNavItem[] = [
  // Group 1: Home
  {
    key: 'dashboard',
    label: 'Dashboard',
    href: '/admin',
    permissions: ['analytics.view'],
    group: 'overview',
    module: 'analytics',
  },
  // launchpad-apps/232 — the front door that groups every other entry into apps.
  // No `permissions`: any signed-in person may open it, and it shows only the apps
  // they can reach, so it exposes nothing the sidebar does not.
  {
    key: 'launchpad',
    label: 'Apps',
    href: '/admin/launchpad',
    group: 'overview',
  },
  {
    key: 'my-actions',
    label: 'My actions',
    href: '/admin/my-actions',
    permissions: ['analytics.view'],
    group: 'overview',
  },

  // Group: Customers
  {
    key: 'leads',
    label: 'Enquiries',
    href: '/admin/leads',
    permissions: ['crm.manage'],
    group: 'customers',
    module: 'crm',
  },
  {
    key: 'contacts',
    label: 'Customers',
    href: '/admin/contacts',
    permissions: ['crm.manage'],
    group: 'customers',
    module: 'crm',
    children: [
      {
        key: 'contacts-insights',
        label: 'Insights',
        href: '/admin/analytics/customers/overview',
        permissions: ['crm.manage'],
        group: 'customers',
        module: 'analytics',
      },
      {
        key: 'contacts-segments',
        label: 'Segments',
        href: '/admin/segments',
        permissions: ['crm.manage'],
        group: 'customers',
        module: 'crm',
      },
    ],
  },
  {
    key: 'inbox',
    label: 'Support Inbox',
    href: '/admin/inbox',
    permissions: ['crm.manage'],
    group: 'customers',
    module: 'crm',
  },

  // Group: Sales
  {
    key: 'orders',
    label: 'Orders',
    href: '/admin/orders',
    permissions: ['orders.manage'],
    group: 'orders',
    module: 'orders',
    children: [
      {
        key: 'orders-insights',
        label: 'Insights',
        href: '/admin/analytics/orders/overview',
        permissions: ['analytics.view'],
        group: 'orders',
        module: 'analytics',
      },
    ],
  },
  {
    key: 'payments',
    label: 'Payment approvals',
    href: '/admin/payments',
    permissions: ['payments.approve'],
    group: 'orders',
    module: 'payments',
  },
  {
    key: 'returns',
    label: 'Returns',
    href: '/admin/fulfilment/returns',
    permissions: ['fulfilment.view', 'fulfilment.manage'],
    group: 'orders',
    module: 'fulfilment',
  },
  // launchpad-apps/234-auction-app.md — off by default (modules.registry.ts), so
  // `moduleOn()` drops it for any deployment that has not enabled `auction`.
  {
    key: 'auctions',
    label: 'Auctions',
    href: '/admin/auctions',
    permissions: ['auction.view', 'auction.manage', 'auction.publish', 'auction.bidders.manage', 'auction.settle'],
    group: 'orders',
    module: 'auction',
  },

  // Group: Fulfilment (WO-6.8)
  {
    key: 'shipments',
    label: 'Shipments',
    href: '/admin/fulfilment/shipments',
    permissions: ['fulfilment.view', 'fulfilment.manage'],
    group: 'fulfilment',
    module: 'fulfilment',
  },
  {
    key: 'manifests',
    label: 'Manifests',
    href: '/admin/fulfilment/manifests',
    permissions: ['fulfilment.view', 'fulfilment.manage'],
    group: 'fulfilment',
    module: 'fulfilment',
  },
  {
    key: 'tracking',
    label: 'Tracking',
    href: '/admin/fulfilment/tracking',
    permissions: ['fulfilment.view', 'fulfilment.manage'],
    group: 'fulfilment',
    module: 'fulfilment',
  },
  {
    key: 'rto',
    label: 'RTO rate',
    href: '/admin/fulfilment/rto',
    permissions: ['fulfilment.view', 'fulfilment.manage'],
    group: 'fulfilment',
    module: 'fulfilment',
  },

  // Group: Overview — the three-level admin shell (R19, WO-18.5). Invisible
  // for every deployment today: `organization` module is off by default, so
  // `moduleOn()` below drops this entry before permissions are even checked.
  {
    key: 'organization',
    label: 'Organization',
    href: '/admin/o',
    permissions: ['organization.view'],
    group: 'overview',
    module: 'organization',
  },

  // Group: Insights
  {
    key: 'insights',
    label: 'Analytics',
    href: '/admin/analytics',
    permissions: ['reports.view'],
    group: 'insights',
    module: 'reports',
  },
  {
    key: 'reports',
    label: 'Reports',
    href: '/admin/reports',
    permissions: ['reports.view'],
    group: 'insights',
    module: 'reports',
  },
  {
    // 113-micro-frontend-embedding.md — a narrow iframe pattern, never a
    // full micro-frontend architecture. Every ACTIVE EmbeddedWidget renders
    // here; defining which widgets exist is settings.embeds.manage's own
    // job, under Settings > Embeds.
    key: 'embeds',
    label: 'Embedded tools',
    href: '/admin/embeds',
    permissions: ['analytics.view'],
    group: 'insights',
  },
  {
    key: 'finance-pnl',
    label: 'Profit & loss',
    href: '/admin/finance',
    permissions: ['finance.view'],
    group: 'finance',
    module: 'finance',
  },
  {
    key: 'finance-margins',
    label: 'Margins',
    href: '/admin/finance/margins',
    permissions: ['finance.view'],
    group: 'finance',
    module: 'finance',
  },
  {
    key: 'finance-cash-flow',
    label: 'Cash flow',
    href: '/admin/finance/cash-flow',
    permissions: ['finance.view'],
    group: 'finance',
    module: 'finance',
  },
  {
    key: 'finance-unit-economics',
    label: 'Unit economics',
    href: '/admin/finance/unit-economics',
    permissions: ['finance.view'],
    group: 'finance',
    module: 'finance',
  },
  {
    key: 'finance-expenses',
    label: 'Expenses',
    href: '/admin/finance/expenses',
    permissions: ['finance.view'],
    group: 'finance',
    module: 'finance',
    children: [
      {
        key: 'finance-expense-analytics',
        label: 'Analytics',
        href: '/admin/analytics/expenses/by-category',
        permissions: ['finance.view'],
        group: 'finance',
      },
      {
        key: 'finance-expense-categories',
        label: 'Categories',
        href: '/admin/finance/expenses/categories',
        permissions: ['finance.manage'],
        group: 'finance',
      },
    ],
  },
  {
    // 04-finance.md WO-4.6 — the ledger's own fiscal calendar. `accounting`
    // is core (always on), so this carries no `module` entry, matching
    // `finance-pnl` above.
    key: 'fiscal-periods',
    label: 'Fiscal periods',
    href: '/admin/accounting/fiscal-periods',
    permissions: ['accounting.view'],
    group: 'finance',
  },
  {
    // doc 155 — off by default (`wallet` module); see DECISIONS.md. Wallet
    // balances/adjustments and merchant payables are two different screens
    // (Law 5: one main job each) sharing this one nav entry's own group.
    key: 'wallet-accounts',
    label: 'Wallets',
    href: '/admin/wallet',
    permissions: ['finance.view'],
    group: 'finance',
    module: 'wallet',
  },
  {
    key: 'merchant-payables',
    label: 'Merchant payables',
    href: '/admin/merchant-payables',
    permissions: ['finance.view'],
    group: 'finance',
    module: 'wallet',
  },
  {
    key: 'credit-notes',
    label: 'Credit Notes',
    href: '/admin/credit-notes',
    permissions: ['finance.view', 'finance.credit-notes.create', 'finance.credit-notes.approve'],
    group: 'finance',
    module: 'receivables',
  },
  {
    key: 'debit-notes',
    label: 'Debit Notes',
    href: '/admin/debit-notes',
    permissions: ['finance.view', 'finance.debit-notes.manage'],
    group: 'finance',
    module: 'receivables',
  },
  {
    key: 'credit-terms',
    label: 'Credit Terms',
    href: '/admin/credit-terms',
    permissions: ['finance.view', 'finance.credit-terms.manage'],
    group: 'finance',
    module: 'receivables',
  },
  {
    key: 'b2b-accounts',
    label: 'B2B Accounts',
    href: '/admin/b2b-accounts',
    permissions: ['finance.view', 'finance.credit-terms.manage'],
    group: 'finance',
    module: 'accounts',
  },
  {
    key: 'dunning-policy',
    label: 'Dunning Policy',
    href: '/admin/dunning-policy',
    permissions: ['finance.view', 'finance.credit-terms.manage'],
    group: 'finance',
    module: 'receivables',
  },
  {
    key: 'statements',
    label: 'Customer Statements',
    href: '/admin/statements',
    permissions: ['finance.view'],
    group: 'finance',
    module: 'receivables',
  },
  {
    key: 'settlements',
    label: 'Settlements',
    href: '/admin/settlements',
    permissions: ['finance.settlement.view', 'finance.settlement.reconcile', 'finance.settlement.approve_writeoff'],
    group: 'finance',
    module: 'settlements',
  },
  {
    key: 'bank-facilities',
    label: 'Bank Facilities',
    href: '/admin/bank-facilities',
    permissions: ['finance.facilities.view', 'finance.facilities.manage', 'finance.facilities.approve_drawdown'],
    group: 'finance',
    module: 'bankfacilities',
  },

  // Group: Workshop
  {
    key: 'stitching',
    label: 'Tailor queue',
    href: '/admin/stitching',
    permissions: ['stitching.jobs.view_queue'],
    group: 'workshop',
    module: 'stitching',
    children: [
      {
        key: 'stitching-insights',
        label: 'Insights',
        href: '/admin/analytics/workshop/output',
        permissions: ['stitching.jobs.view_queue'],
        group: 'workshop',
        module: 'analytics',
      },
    ],
  },
  {
    key: 'stitching-bookings',
    label: 'Stitching bookings',
    href: '/admin/stitching/bookings',
    permissions: ['stitching.bookings.manage'],
    group: 'workshop',
    module: 'stitching',
  },

  // Group: Catalogue
  {
    key: 'import',
    label: 'Bulk import',
    href: '/admin/import',
    permissions: ['catalog.manage'],
    group: 'catalogue',
    module: 'catalog',
  },
  {
    // 165-cross-tenant-marketplace-directory.md — off by default (module:
    // 'marketplace'); a deployment sees this only once ops has issued it a
    // MarketplacePublisherCredential (MARKETPLACE_API_URL/_API_KEY set).
    key: 'marketplace',
    label: 'Marketplace',
    href: '/admin/marketplace',
    permissions: ['catalog.manage'],
    group: 'catalogue',
    module: 'marketplace',
  },
  {
    key: 'products',
    label: 'Products & services',
    href: '/admin/products',
    permissions: ['catalog.manage'],
    group: 'catalogue',
    module: 'catalog',
    children: [
      {
        key: 'products-insights',
        label: 'Insights',
        href: '/admin/analytics/products/top-sellers',
        permissions: ['analytics.view'],
        group: 'catalogue',
        module: 'analytics',
      },
    ],
  },
  {
    key: 'categories',
    label: 'Categories',
    href: '/admin/categories',
    permissions: ['catalog.manage'],
    group: 'catalogue',
    module: 'catalog',
  },
  {
    key: 'brands',
    label: 'Brands',
    href: '/admin/brands',
    permissions: ['catalog.manage'],
    group: 'catalogue',
    module: 'catalog',
  },
  {
    // 150-product-kitting-bundles.md WO-150.6.
    key: 'bundles',
    label: 'Bundles',
    href: '/admin/bundles',
    permissions: ['catalog.manage'],
    group: 'catalogue',
    module: 'catalog',
  },
  {
    key: 'option-templates',
    label: 'Options & attributes',
    href: '/admin/options',
    permissions: ['catalog.manage'],
    group: 'catalogue',
    module: 'catalog',
  },
  {
    key: 'seo',
    label: 'SEO & redirects',
    href: '/admin/seo',
    permissions: ['catalog.manage'],
    group: 'catalogue',
    module: 'catalog',
  },
  {
    key: 'garments',
    label: 'Garments & measurements',
    href: '/admin/garments',
    permissions: ['measurements.manage_blueprints'],
    group: 'catalogue',
    module: 'measurements',
  },
  {
    key: 'designs',
    label: 'Stitching designs',
    href: '/admin/designs',
    permissions: ['stitching.designs.manage'],
    group: 'catalogue',
    module: 'stitching',
  },

  // Group: Inventory
  {
    key: 'inventory',
    label: 'Inventory',
    href: '/admin/inventory',
    permissions: ['inventory.manage'],
    group: 'stock',
    module: 'inventory',
    children: [
      {
        key: 'inventory-reorder',
        label: 'Reorder',
        href: '/admin/inventory/reorder',
        permissions: ['inventory.manage'],
        group: 'stock',
      },
      {
        key: 'inventory-slow-movers',
        label: 'Slow Movers',
        href: '/admin/inventory/slow-movers',
        permissions: ['inventory.manage'],
        group: 'stock',
      },
      {
        key: 'inventory-counts',
        label: 'Stock Counts',
        href: '/admin/inventory/counts',
        permissions: ['inventory.count'],
        group: 'stock',
      },
      {
        key: 'inventory-spot-checks',
        label: 'Spot Checks',
        href: '/admin/inventory/spot-checks',
        permissions: ['inventory.count', 'inventory.spot_checks.manage'],
        group: 'stock',
      },
      {
        key: 'inventory-variances-by-shift',
        label: 'Variances by Shift',
        href: '/admin/inventory/variances/by-shift',
        permissions: ['inventory.manage'],
        group: 'stock',
      },
      {
        key: 'inventory-insights',
        label: 'Insights',
        href: '/admin/analytics/inventory/valuation',
        permissions: ['analytics.view'],
        group: 'stock',
        module: 'analytics',
      },
      {
        key: 'inventory-suspicious-traffic',
        label: 'Suspicious Traffic',
        href: '/admin/analytics/suspicious-traffic',
        permissions: ['analytics.view'],
        group: 'stock',
        module: 'analytics',
      },
      {
        key: 'inventory-wishlisted',
        label: 'Wishlisted & Out of Stock',
        href: '/admin/inventory/wishlisted',
        permissions: ['analytics.view'],
        group: 'stock',
        module: 'wishlist',
      },
      {
        key: 'inventory-lots',
        label: 'Lots & Batches',
        href: '/admin/inventory/lots',
        permissions: ['inventory.lots.manage'],
        group: 'stock',
      },
      {
        key: 'inventory-serials',
        label: 'Serial Numbers',
        href: '/admin/inventory/serials',
        permissions: ['inventory.manage'],
        group: 'stock',
      },
    ],
  },
  {
    key: 'purchasing',
    label: 'Purchase orders',
    href: '/admin/purchase-orders',
    permissions: ['purchasing.manage'],
    group: 'stock',
    module: 'purchasing',
    children: [
      {
        key: 'purchasing-spend',
        label: 'Spend',
        href: '/admin/analytics/purchasing/spend',
        permissions: ['purchasing.manage'],
        group: 'stock',
        module: 'analytics',
      },
    ],
  },
  {
    key: 'requisitions',
    label: 'Requisitions',
    href: '/admin/requisitions',
    permissions: ['purchasing.requisitions.create', 'purchasing.requisitions.approve'],
    group: 'stock',
    module: 'purchasing',
  },
  {
    key: 'suppliers',
    label: 'Suppliers',
    href: '/admin/suppliers',
    permissions: ['suppliers.manage'],
    group: 'stock',
    module: 'purchasing',
  },
  {
    key: 'resilience',
    label: 'Resilience Planning',
    href: '/admin/resilience',
    permissions: ['planning.propagation.view'],
    group: 'stock',
    module: 'planning',
  },
  {
    key: 'transfers',
    label: 'Transfers',
    href: '/admin/transfers',
    permissions: ['transfers.manage'],
    group: 'stock',
    module: 'transfers',
  },
  {
    key: 'trading-partners',
    label: 'Trading Partners',
    href: '/admin/trading-partners',
    permissions: ['purchasing.manage'],
    group: 'stock',
    module: 'tradingpartners',
  },
  {
    key: 'invoices',
    label: 'Invoices',
    href: '/admin/invoices',
    permissions: ['orders.manage'],
    group: 'stock',
    module: 'tradingpartners',
  },

  // Group: Manufacturing
  {
    key: 'bom-recipes',
    label: 'Recipes',
    href: '/admin/bom',
    permissions: ['bom.view'],
    group: 'manufacturing',
    module: 'bom',
  },
  {
    key: 'bom-raw-materials',
    label: 'Raw Materials',
    href: '/admin/bom/raw-materials',
    permissions: ['bom.view'],
    group: 'manufacturing',
    module: 'bom',
  },
  {
    key: 'bom-production',
    label: 'Production',
    href: '/admin/bom/production',
    permissions: ['bom.view'],
    group: 'manufacturing',
    module: 'bom',
  },
  {
    key: 'bom-raw-usage',
    label: 'Raw Usage',
    href: '/admin/bom/raw-usage',
    permissions: ['bom.view'],
    group: 'manufacturing',
    module: 'bom',
  },

  // Group: Payroll
  {
    key: 'payroll-compensation',
    label: 'Compensation',
    href: '/admin/payroll/compensation',
    permissions: ['payroll.view'],
    group: 'payroll',
    module: 'payroll',
  },
  {
    key: 'payroll-leave',
    label: 'Leave requests',
    href: '/admin/payroll/leave',
    permissions: ['payroll.view'],
    group: 'payroll',
    module: 'payroll',
  },
  {
    key: 'payroll-runs',
    label: 'Pay runs',
    href: '/admin/payroll/runs',
    permissions: ['payroll.view'],
    group: 'payroll',
    module: 'payroll',
  },
  {
    key: 'payroll-me',
    label: 'My pay',
    href: '/admin/payroll/me',
    permissions: ['payroll.view_own'],
    group: 'payroll',
    module: 'payroll',
  },
  {
    // hr-people-org/79-employee-asset-management.md — no separate "hr" nav
    // group exists (this codebase's HR-ish entries live under "Payroll"),
    // so this joins them here rather than inventing a second group for one
    // screen.
    key: 'hr-assets',
    label: 'Assets',
    href: '/admin/hr/assets',
    permissions: ['hr.assets.manage'],
    group: 'payroll',
    module: 'hr',
  },

  // Group: Organization
  {
    key: 'org-structure',
    label: 'Structure',
    href: '/admin/org-structure',
    permissions: ['org.structure.view', 'org.structure.manage'],
    group: 'organization',
    module: 'orgstructure',
  },
  {
    key: 'people',
    label: 'People',
    href: '/admin/people',
    permissions: ['hr.people.view', 'hr.people.manage'],
    group: 'organization',
    module: 'hr',
  },
  {
    // attendance-workforce/22-attendance-shifts-leave.md WO-22.5.
    key: 'attendance',
    label: 'Attendance',
    href: '/admin/attendance',
    permissions: ['hr.attendance.view', 'hr.attendance.reconcile'],
    group: 'organization',
    module: 'attendance',
  },
  {
    // No `permissions` — visible to everyone signed in (this document's own
    // "Solo: self punch on one screen" silhouette). Self-punch needs no
    // capability beyond being signed in; see AttendanceController.
    key: 'my-attendance',
    label: 'My attendance',
    href: '/admin/my-attendance',
    group: 'organization',
    module: 'attendance',
  },
  {
    // tasks-notifications-support/23-tasks-allotment-tracking.md — this
    // doc's own explicit instruction, in org-structure.prisma's own header
    // comment: "every later hr-people-org document (postings, attendance,
    // tasks) hangs off this same tree." Joins the Organization group rather
    // than inventing a ninth for two screens.
    key: 'tasks',
    label: 'Tasks',
    href: '/admin/tasks',
    permissions: ['tasks.view', 'tasks.assign'],
    group: 'organization',
    module: 'tasks',
  },
  {
    // No `permissions` — "my work" needs only `tasks.view`'s OWN endpoint
    // (GET /admin/tasks/my is @AuthenticatedOnly, same shape as
    // my-attendance just above): everyone signed in has tasks to do.
    key: 'my-tasks',
    label: 'My tasks',
    href: '/admin/my-tasks',
    group: 'organization',
    module: 'tasks',
  },
  {
    // tasks-notifications-support/24-internal-notifications-meetings-escalation.md.
    key: 'notify',
    label: 'Announcements',
    href: '/admin/notify',
    permissions: ['notify.send'],
    group: 'organization',
    module: 'notify',
  },
  {
    key: 'notify-meetings',
    label: 'Meetings',
    href: '/admin/notify/meetings',
    permissions: ['notify.send'],
    group: 'organization',
    module: 'notify',
  },
  {
    key: 'notify-escalation-rules',
    label: 'Escalation rules',
    href: '/admin/notify/escalation-rules',
    permissions: ['notify.escalation.manage'],
    group: 'organization',
    module: 'notify',
  },
  {
    // tasks-notifications-support/61-policy-communications-bulletin.md
    // WO-61.5 — hr.bulletins.view is seeded broadly (TAILOR/STAFF/ADMIN),
    // so this entry is reachable by nearly everyone, unlike the notify.*
    // entries above it.
    key: 'bulletins',
    label: 'Bulletins',
    href: '/admin/bulletins',
    permissions: ['hr.bulletins.view'],
    group: 'organization',
    module: 'notify',
  },

  // Group: Settings
  {
    key: 'users',
    label: 'Team & Access',
    href: '/admin/users',
    permissions: ['users.manage'],
    group: 'settings',
    children: [
      {
        // Oversight of every account's keys — read and revoke only
        // (163-personal-api-keys.md §5). Under Team & Access because the
        // same permission already governs the accounts those keys act as.
        key: 'users-api-keys',
        label: 'API keys',
        href: '/admin/users/api-keys',
        permissions: ['users.manage'],
        group: 'settings',
      },
    ],
  },
  {
    // Personal, so no permission: any staff member may give a script or an
    // agent a slice of what they hold. The page explains when they hold
    // nothing that may be delegated.
    key: 'account-api-keys',
    label: 'My API keys',
    href: '/admin/account/api-keys',
    group: 'settings',
  },
  {
    // tasks-notifications-support/64-help-desk-support-ticketing.md
    // WO-64.5 — "alongside account and company profile configuration
    // menus," per the request's own placement. support.tickets.raise is
    // seeded broadly (every internal role) since anyone may need help.
    key: 'support-tickets',
    label: 'Support',
    href: '/admin/support/tickets',
    permissions: ['support.tickets.raise'],
    group: 'settings',
    module: 'support',
  },
  {
    // 148-external-customer-support-portal.md WO-148.4 — a second entry, not
    // a tab on the internal-tickets screen: `CustomerSupportTicket` is a
    // distinct model with a distinct requester (`Contact`, never `User`), so
    // it is a distinct object with its own queue, sharing only the handler
    // permissions doc 64 already seeded (`support.tickets.handle`/`.view_all`).
    key: 'support-customer-tickets',
    label: 'Customer tickets',
    href: '/admin/support/customer-tickets',
    permissions: ['support.tickets.handle', 'support.tickets.view_all'],
    group: 'settings',
    module: 'support',
  },
  {
    key: 'settings',
    label: 'Settings',
    href: '/admin/settings',
    permissions: ['settings.manage'],
    group: 'settings',
  },
  {
    // 161-sso-identity-federation.md — which identity providers may sign
    // staff in. Its own permission, not settings.manage: critical and
    // non-delegatable, since a connection's domains decide who gets in.
    key: 'sso',
    label: 'Single sign-on',
    href: '/admin/settings/sso',
    permissions: ['settings.sso.manage'],
    group: 'settings',
  },
  {
    key: 'tax',
    label: 'Tax',
    href: '/admin/tax',
    permissions: ['tax.manage'],
    group: 'settings',
    module: 'tax',
  },
  {
    key: 'shipping-settings',
    label: 'Shipping',
    href: '/admin/settings/shipping',
    permissions: ['fulfilment.manage'],
    group: 'settings',
    module: 'fulfilment',
  },
  {
    key: 'email-templates',
    label: 'Email Templates',
    href: '/admin/email-templates',
    permissions: ['settings.manage'],
    group: 'settings',
  },
  {
    key: 'email-accounts',
    label: 'Email Accounts',
    href: '/admin/email-accounts',
    permissions: ['settings.manage'],
    group: 'settings',
  },
  {
    // doc 14 (commercial-licensing-agency/14-managed-services-module.md) —
    // agency-hosted deliveries only; `managed-services` is off by default
    // for every deployment (modules.registry.ts) and never appears here for
    // a self-hosted client's own extracted repo.
    key: 'managed-services',
    label: 'Hosting & Billing',
    href: '/admin/managed-services',
    permissions: ['settings.manage'],
    group: 'settings',
    module: 'managed-services',
  },
  {
    key: 'ai',
    label: 'AI',
    href: '/admin/ai',
    permissions: ['ai.view', 'ai.manage'],
    group: 'settings',
  },
  {
    // 37-scalability-future-upgrades.md. Under Settings, alongside AI and
    // Hosting & Billing above — engineering-ops tooling, not a customer- or
    // branch-facing capability (doc 37's own "Whose rows" scope-lens), so
    // it belongs with the other platform-configuration screens rather than
    // a new top-level nav group for one screen.
    key: 'feature-flags',
    label: 'Feature flags',
    href: '/admin/feature-flags',
    permissions: ['platform.flags.manage'],
    group: 'settings',
    module: 'feature-flags',
  },
  {
    // 38-resilience-engineering.md. Same shape as Feature flags just
    // above — engineering-ops tooling (doc 38's own "Whose rows" scope-
    // lens), so it sits beside it under Settings rather than a new group.
    // Named "Platform Resilience" and routed to /admin/platform-resilience,
    // distinct from the unrelated "Resilience Planning" entry above
    // (144-supply-chain-resilience-planning-engine.md), which already
    // holds /admin/resilience.
    key: 'platform-resilience',
    label: 'Platform Resilience',
    href: '/admin/platform-resilience',
    permissions: ['platform.resilience.view'],
    group: 'settings',
    module: 'resilience',
  },
  {
    // WO-35 (docs/implementation/ai-layer/35-scalable-rag-document-retrieval.md).
    // Two separate entries, not one nested under the other: a holder of only
    // `rag.query` (never sees corpus administration) must still reach the
    // console directly, and a holder of only `rag.ingest.manage` must not be
    // sent to a query screen its own permission cannot use — PRM-2's "hide a
    // nav entry... the reason names the permission," not a page that 403s
    // once clicked.
    key: 'rag',
    label: 'Document corpus',
    href: '/admin/rag',
    permissions: ['rag.ingest.manage'],
    group: 'settings',
    module: 'rag',
  },
  {
    key: 'rag-query',
    label: 'RAG query console',
    href: '/admin/rag/query',
    permissions: ['rag.query'],
    group: 'settings',
    module: 'rag',
  },
  {
    key: 'marketing',
    label: 'Marketing',
    href: '/admin/marketing',
    permissions: ['marketing.manage'],
    // Reaching customers is customer work, not setup. It sat under Settings,
    // which is where things go when a nav is grouped by module rather than
    // by what somebody came here to do.
    group: 'customers',
    module: 'marketing',
    children: [
      {
        key: 'marketing-discounts',
        label: 'Discounts',
        href: '/admin/marketing/discounts',
        permissions: ['promotions.view'],
        group: 'customers',
        module: 'promotions',
      },
      {
        key: 'marketing-promo-codes',
        label: 'Promo codes',
        href: '/admin/marketing/promo-codes',
        permissions: ['promotions.view'],
        group: 'customers',
        module: 'promotions',
      },
      {
        key: 'marketing-gift-cards',
        label: 'Gift cards',
        href: '/admin/customers/gift-cards',
        permissions: ['giftcards.view'],
        group: 'customers',
        module: 'giftcards',
      },
      {
        key: 'marketing-content',
        label: 'Content',
        href: '/admin/content',
        permissions: ['content.view', 'content.manage'],
        group: 'customers',
        module: 'content',
      },
      {
        key: 'marketing-collections',
        label: 'Collections',
        href: '/admin/collections',
        permissions: ['collections.view', 'collections.manage'],
        group: 'customers',
        module: 'collections',
      },
      {
        key: 'marketing-search',
        label: 'Search',
        href: '/admin/search',
        permissions: ['search.view', 'search.manage'],
        group: 'customers',
        module: 'search',
      },
      {
        key: 'marketing-campaigns',
        label: 'Campaigns',
        href: '/admin/campaigns',
        permissions: ['campaigns.view', 'campaigns.manage'],
        group: 'customers',
        module: 'marketing',
      },
      {
        key: 'marketing-onsite-messages',
        label: 'On-site messages',
        href: '/admin/onsite-messages',
        permissions: ['onsitemessages.view', 'onsitemessages.manage'],
        group: 'customers',
        module: 'onsitemessages',
      },
      {
        key: 'marketing-reviews',
        label: 'Reviews',
        href: '/admin/reviews',
        permissions: ['reviews.moderate'],
        group: 'customers',
        module: 'reviews',
      },
      {
        key: 'marketing-loyalty',
        label: 'Loyalty',
        href: '/admin/loyalty',
        permissions: ['loyalty.view'],
        group: 'customers',
        module: 'loyalty',
      },
    ],
  },
];

/**
 * Where a signed-in user lands after login. Someone with a dashboard to look
 * at (analytics.view — staff and admins) lands on it; everyone else (the
 * tailor whose permissions are scoped to the workshop) lands on the queue
 * they actually work from.
 */
export function landingFor(permissions: readonly string[] = []): string {
  permissions = permissions || [];
  return permissions.includes('analytics.view') ? '/admin' : '/admin/stitching';
}

/**
 * Filters the registry down to what a signed-in user actually sees:
 * permission-gated (any listed permission is enough) AND, when an item
 * names the API module that owns it, only shown if that module is on for
 * this deployment — otherwise the entry points at a route that 404s. Pass
 * `enabledModules` from `GET /meta` (see admin-client.ts's session bootstrap);
 * omitting it (or passing `null`) treats every module as enabled, so callers
 * that haven't fetched it yet fail open to permissions-only filtering rather
 * than hiding everything.
 */
export function navFor(
  permissions: readonly string[] = [],
  enabledModules?: readonly string[] | null,
): AdminNavItem[] {
  permissions = permissions || [];
  const hasPermission = (item: AdminNavItem) =>
    !item.permissions || item.permissions.some((key) => permissions.includes(key));
  const moduleOn = (item: AdminNavItem) => isModuleEnabled(item.module, enabledModules);

  return ADMIN_NAV.filter((item) => hasPermission(item) && moduleOn(item)).map((item) => {
    if (!item.children) return item;
    const filteredChildren = item.children.filter((child) => hasPermission(child) && moduleOn(child));
    return { ...item, children: filteredChildren };
  });
}

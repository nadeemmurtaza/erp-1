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
        href: '/admin/customers/insights',
        permissions: ['crm.manage'],
        group: 'customers',
        module: 'analytics',
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
        href: '/admin/orders/insights',
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
    label: 'Insights',
    href: '/admin/insights',
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
    key: 'finance-expenses',
    label: 'Expenses',
    href: '/admin/finance/expenses',
    permissions: ['finance.view'],
    group: 'insights',
    module: 'finance',
    children: [
      {
        key: 'finance-expense-analytics',
        label: 'Analytics',
        href: '/admin/finance/expenses/analytics',
        permissions: ['finance.view'],
        group: 'insights',
      },
      {
        key: 'finance-expense-categories',
        label: 'Categories',
        href: '/admin/finance/expenses/categories',
        permissions: ['finance.manage'],
        group: 'insights',
      },
    ],
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
        href: '/admin/workshop/insights',
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
        href: '/admin/products/insights',
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
        key: 'inventory-insights',
        label: 'Insights',
        href: '/admin/inventory/insights',
        permissions: ['analytics.view'],
        group: 'stock',
        module: 'analytics',
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
        href: '/admin/purchase-orders/spend',
        permissions: ['purchasing.manage'],
        group: 'stock',
        module: 'analytics',
      },
    ],
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

  // Group: Settings
  {
    key: 'users',
    label: 'Team & Access',
    href: '/admin/users',
    permissions: ['users.manage'],
    group: 'settings',
  },
  {
    key: 'settings',
    label: 'Settings',
    href: '/admin/settings',
    permissions: ['settings.manage'],
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
    key: 'marketing',
    label: 'Marketing',
    href: '/admin/marketing',
    permissions: ['marketing.manage'],
    // Reaching customers is customer work, not setup. It sat under Settings,
    // which is where things go when a nav is grouped by module rather than
    // by what somebody came here to do.
    group: 'customers',
    module: 'marketing',
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

import type { PermissionKey } from '@newax/shared';

import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Package,
  Boxes,
  Scissors,
  Users,
  Megaphone,
  Wallet,
  BarChart3,
  Settings,
} from 'lucide-react';

export const ICON_MAP = {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Package,
  Boxes,
  Scissors,
  Users,
  Megaphone,
  Wallet,
  BarChart3,
  Settings,
} as const;

export interface AdminNavGroup {
  key: AdminNavItem['group'];
  label: string;
  /** lucide-react icon name. */
  icon: keyof typeof ICON_MAP;
}

/** Sidebar order is THIS ARRAY's order. Nothing else decides it. */
export const NAV_GROUPS: readonly AdminNavGroup[] = [
  { key: 'home',       label: 'Home',               icon: 'LayoutDashboard' },
  { key: 'sales',      label: 'Sales',              icon: 'ShoppingCart' },
  { key: 'fulfilment', label: 'Fulfilment',         icon: 'Truck' },
  { key: 'catalogue',  label: 'Catalogue',          icon: 'Package' },
  { key: 'inventory',  label: 'Inventory & Supply', icon: 'Boxes' },
  { key: 'workshop',   label: 'Workshop',           icon: 'Scissors' },
  { key: 'customers',  label: 'Customers',          icon: 'Users' },
  { key: 'marketing',  label: 'Marketing',          icon: 'Megaphone' },
  { key: 'finance',    label: 'Finance',            icon: 'Wallet' },
  { key: 'insights',   label: 'Insights',           icon: 'BarChart3' },
  { key: 'settings',   label: 'Settings',           icon: 'Settings' },
] as const;

export interface AdminNavItem {
  /** Stable key, matching the API module that owns the section. */
  key: string;
  label: string;
  href: string;
  /** Permissions that unlock this entry — any one is enough. Omit for everyone signed in. */
  permissions?: readonly PermissionKey[];
  group: 'home' | 'sales' | 'fulfilment' | 'catalogue' | 'inventory' | 'workshop' | 'customers' | 'marketing' | 'finance' | 'insights' | 'settings';
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
    group: 'home',
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
    group: 'sales',
    module: 'orders',
  },
  {
    key: 'payments',
    label: 'Payment approvals',
    href: '/admin/payments',
    permissions: ['payments.approve'],
    group: 'sales',
    module: 'payments',
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

  // Group: Workshop
  {
    key: 'stitching',
    label: 'Tailor queue',
    href: '/admin/stitching',
    permissions: ['stitching.jobs.view_queue'],
    group: 'workshop',
    module: 'stitching',
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
    group: 'inventory',
    module: 'inventory',
    children: [
      {
        key: 'inventory-reorder',
        label: 'Reorder',
        href: '/admin/inventory/reorder',
        permissions: ['inventory.manage'],
        group: 'inventory',
      },
      {
        key: 'inventory-slow-movers',
        label: 'Slow Movers',
        href: '/admin/inventory/slow-movers',
        permissions: ['inventory.manage'],
        group: 'inventory',
      },
      {
        key: 'inventory-counts',
        label: 'Stock Counts',
        href: '/admin/inventory/counts',
        permissions: ['inventory.count'],
        group: 'inventory',
      },
    ],
  },
  {
    key: 'purchasing',
    label: 'Purchase orders',
    href: '/admin/purchase-orders',
    permissions: ['purchasing.manage'],
    group: 'inventory',
    module: 'purchasing',
  },
  {
    key: 'suppliers',
    label: 'Suppliers',
    href: '/admin/suppliers',
    permissions: ['suppliers.manage'],
    group: 'inventory',
    module: 'purchasing',
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
    group: 'settings',
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
  const moduleOn = (item: AdminNavItem) =>
    !item.module || !enabledModules || enabledModules.includes(item.module);

  return ADMIN_NAV.filter((item) => hasPermission(item) && moduleOn(item)).map((item) => {
    if (!item.children) return item;
    const filteredChildren = item.children.filter((child) => hasPermission(child) && moduleOn(child));
    return { ...item, children: filteredChildren };
  });
}

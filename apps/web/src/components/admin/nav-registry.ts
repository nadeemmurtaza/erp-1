import type { PermissionKey } from '@yaseen/shared';

import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Scissors,
  Package,
  Settings,
  FileText,
  Warehouse,
  Briefcase,
  PenTool,
  MessageSquare
} from 'lucide-react';

export const ICON_MAP = {
  dashboard: LayoutDashboard,
  people: Users,
  sales: ShoppingCart,
  production: Scissors,
  catalogue: Package,
  settings: Settings,
  insights: FileText,
  inventory: Warehouse,
  marketing: MessageSquare,
  finances: Briefcase,
  content: PenTool,
};

export const NAV_GROUPS = [
  { id: 'overview', label: 'Overview' },
  { id: 'people', label: 'Customer Lifecycle' },
  { id: 'sales', label: 'Sales Operations' },
  { id: 'insights', label: 'Insights' },
  { id: 'production', label: 'Workshop' },
  { id: 'catalogue', label: 'Catalogue & Data' },
  { id: 'inventory', label: 'Inventory & Supply' },
  { id: 'settings', label: 'Settings' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'finances', label: 'Finances' },
  { id: 'content', label: 'Content' }
] as const;

export interface AdminNavItem {
  /** Stable key, matching the API module that owns the section. */
  key: string;
  label: string;
  href: string;
  /** Permissions that unlock this entry — any one is enough. Omit for everyone signed in. */
  permissions?: readonly PermissionKey[];
  group: 'overview' | 'people' | 'sales' | 'production' | 'catalogue' | 'settings' | 'inventory' | 'insights' | 'marketing' | 'finances' | 'content';
  icon: keyof typeof ICON_MAP;
  children?: AdminNavItem[];
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
  // Group 1: Overview
  {
    key: 'dashboard',
    label: 'Dashboard',
    href: '/admin',
    permissions: ['analytics.view'],
    group: 'overview',
    icon: 'dashboard',
  },

  // Group 2: Customer Lifecycle (follows conversion funnel: Enquiries/Leads → Customers)
  {
    key: 'leads',
    label: 'Enquiries',
    href: '/admin/leads',
    permissions: ['crm.manage'],
    group: 'people',
    icon: 'people',
  },
  {
    key: 'contacts',
    label: 'Customers',
    href: '/admin/contacts',
    permissions: ['crm.manage'],
    group: 'people',
    icon: 'people',
  },

  // Group 3: Sales Operations (follows order processing sequence)
  {
    key: 'orders',
    label: 'Orders',
    href: '/admin/orders',
    permissions: ['orders.manage'],
    group: 'sales',
    icon: 'sales',
  },
  {
    key: 'payments',
    label: 'Payment approvals',
    href: '/admin/payments',
    permissions: ['payments.approve'],
    group: 'sales',
    icon: 'sales',
  },
  {
    key: 'reports',
    label: 'Reports',
    href: '/admin/reports',
    permissions: ['reports.view'],
    group: 'insights',
    icon: 'insights',
  },

  // Group 4: Production/Workshop (Tailors see ONLY this + Dashboard redirect)
  {
    key: 'stitching',
    label: 'Tailor queue',
    href: '/admin/stitching',
    permissions: ['stitching.jobs.view_queue'],
    group: 'production',
    icon: 'production',
  },
  {
    key: 'stitching-bookings',
    label: 'Stitching bookings',
    href: '/admin/stitching/bookings',
    permissions: ['stitching.bookings.manage'],
    group: 'production',
    icon: 'production',
  },

  // Group 5: Catalogue & Data (elevated Bulk Import for data entry workflow)
  {
    key: 'import',
    label: 'Bulk import',
    href: '/admin/import',
    permissions: ['catalog.manage'],
    group: 'catalogue',
    icon: 'catalogue',
  },
  {
    key: 'products',
    label: 'Products & services',
    href: '/admin/products',
    permissions: ['catalog.manage'],
    group: 'catalogue',
    icon: 'catalogue',
  },
  {
    key: 'inventory',
    label: 'Inventory',
    href: '/admin/inventory',
    permissions: ['inventory.manage'],
    group: 'inventory',
    icon: 'inventory',
  },
  {
    key: 'categories',
    label: 'Categories',
    href: '/admin/categories',
    permissions: ['catalog.manage'],
    group: 'catalogue',
    icon: 'catalogue',
  },
  {
    key: 'garments',
    label: 'Garments & measurements',
    href: '/admin/garments',
    permissions: ['measurements.manage_blueprints'],
    group: 'catalogue',
    icon: 'catalogue',
  },
  {
    key: 'designs',
    label: 'Stitching designs',
    href: '/admin/designs',
    permissions: ['stitching.designs.manage'],
    group: 'catalogue',
    icon: 'catalogue',
  },

  // Group 6: Settings
  {
    key: 'users',
    label: 'Team & Access',
    href: '/admin/users',
    permissions: ['users.manage'],
    group: 'settings',
    icon: 'settings',
  },
  {
    key: 'settings',
    label: 'Settings',
    href: '/admin/settings',
    permissions: ['settings.manage'],
    group: 'settings',
    icon: 'settings',
  },
];

/**
 * Where a signed-in user lands after login. Someone with a dashboard to look
 * at (analytics.view — staff and admins) lands on it; everyone else (the
 * tailor whose permissions are scoped to the workshop) lands on the queue
 * they actually work from.
    icon: 'inventory',
  },
  {
    key: 'categories',
    label: 'Categories',
    href: '/admin/categories',
    permissions: ['catalog.manage'],
    group: 'catalogue',
    icon: 'catalogue',
  },
  {
    key: 'garments',
    label: 'Garments & measurements',
    href: '/admin/garments',
    permissions: ['measurements.manage_blueprints'],
    group: 'catalogue',
    icon: 'catalogue',
  },
  {
    key: 'designs',
    label: 'Stitching designs',
    href: '/admin/designs',
    permissions: ['stitching.designs.manage'],
    group: 'catalogue',
    icon: 'catalogue',
  },

  // Group 6: Settings
  {
    key: 'users',
    label: 'Team & Access',
    href: '/admin/users',
    permissions: ['users.manage'],
    group: 'settings',
    icon: 'settings',
  },
  {
    key: 'settings',
    label: 'Settings',
    href: '/admin/settings',
    permissions: ['settings.manage'],
    group: 'settings',
    icon: 'settings',
  },
];

/**
 * Where a signed-in user lands after login. Someone with a dashboard to look
 * at (analytics.view — staff and admins) lands on it; everyone else (the
 * tailor whose permissions are scoped to the workshop) lands on the queue
 * they actually work from.
 */
export function landingFor(permissions: readonly string[]): string {
  return permissions.includes('analytics.view') ? '/admin' : '/admin/stitching';
}

export function navFor(permissions: readonly string[]): AdminNavItem[] {
  return ADMIN_NAV.filter(
    (item) => !item.permissions || item.permissions.some((key) => permissions.includes(key)),
  );
}

// Inventory & Supply future children
// export const INVENTORY_CHILDREN = [
//   {
//     key: 'purchasing',
//     label: 'Purchasing',
//     href: '/admin/purchasing',
//     group: 'inventory',
//     icon: 'inventory',
//   }
// ];

const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'apps/web/src/components/admin/nav-registry.ts');
let content = fs.readFileSync(file, 'utf8');

// Replace group type
content = content.replace(
  /group: 'overview' \| 'catalogue' \| 'sales' \| 'production' \| 'people' \| 'settings';/,
  `group: 'overview' | 'people' | 'sales' | 'production' | 'catalogue' | 'settings' | 'inventory' | 'insights' | 'marketing' | 'finances' | 'content';\n  icon: keyof typeof ICON_MAP;\n  children?: AdminNavItem[];\n  module?: string;`
);

// Add ICON_MAP and NAV_GROUPS
content = content.replace(
  /export interface AdminNavItem/,
  `import {
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

export interface AdminNavItem`
);

// Delete NAV_GROUP_LABELS
content = content.replace(
  /export const NAV_GROUP_LABELS: Record<AdminNavItem\['group'\], string> = {[\s\S]*?};\n/,
  ``
);

// Add icons to ADMIN_NAV and fix group changes
const replacements = [
  { key: 'dashboard', group: 'overview', icon: 'dashboard' },
  { key: 'leads', group: 'people', icon: 'people' },
  { key: 'contacts', group: 'people', icon: 'people' },
  { key: 'orders', group: 'sales', icon: 'sales' },
  { key: 'payments', group: 'sales', icon: 'sales' },
  { key: 'reports', group: 'insights', icon: 'insights' },
  { key: 'stitching', group: 'production', icon: 'production' },
  { key: 'stitching-bookings', group: 'production', icon: 'production' },
  { key: 'import', group: 'catalogue', icon: 'catalogue' },
  { key: 'products', group: 'catalogue', icon: 'catalogue' },
  { key: 'inventory', group: 'inventory', icon: 'inventory' },
  { key: 'categories', group: 'catalogue', icon: 'catalogue' },
  { key: 'garments', group: 'catalogue', icon: 'catalogue' },
  { key: 'designs', group: 'catalogue', icon: 'catalogue' },
  { key: 'users', group: 'settings', icon: 'settings' },
  { key: 'settings', group: 'settings', icon: 'settings' },
];

for (const { key, group, icon } of replacements) {
  const regex = new RegExp(`({\\s*key:\\s*'${key}',[\\s\\S]*?)(group:\\s*'[a-z]+',)(\\s*})`);
  content = content.replace(regex, `$1group: '${group}',\n    icon: '${icon}',$3`);
}

// Add empty Inventory & Supply group with children commented out
// But wait, inventory is already in inventory group. 
// "Add the empty "Inventory & Supply" group with its future children commented out."
// Maybe the group should be empty? 
content += `\n// Inventory & Supply future children
// export const INVENTORY_CHILDREN = [
//   {
//     key: 'purchasing',
//     label: 'Purchasing',
//     href: '/admin/purchasing',
//     group: 'inventory',
//     icon: 'inventory',
//   }
// ];
`;

fs.writeFileSync(file, content);
console.log('updated nav-registry.ts');

const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'apps/web/src/components/admin/admin-shell.tsx');
let content = fs.readFileSync(file, 'utf8');

// Update imports
content = content.replace(
  /import { NAV_GROUP_LABELS, navFor, type AdminNavItem } from '\.\/nav-registry';/,
  `import { NAV_GROUPS, ICON_MAP, navFor, type AdminNavItem } from './nav-registry';`
);

// Delete the set extraction
content = content.replace(
  /const groups = \[\.\.\.new Set\(items\.map\(\(item\) => item\.group\)\)\];\n/,
  ``
);

// Replace mapping groups in JSX (two places: mobile and desktop)
// Replace groups.map((group) => ...) with NAV_GROUPS.map((group) => ...)
content = content.replace(
  /\{groups\.map\(\(group\) => \([\s\S]*?key=\{group\}[\s\S]*?\{NAV_GROUP_LABELS\[group\]\}[\s\S]*?\{items\s*\.filter\(\(item\) => item\.group === group\)[\s\S]*?\}\)\}/g,
  (match) => {
    let replaced = match.replace(/groups\.map\(\(group\)/g, 'NAV_GROUPS.map((group)');
    replaced = replaced.replace(/key=\{group\}/g, 'key={group.id}');
    replaced = replaced.replace(/\{NAV_GROUP_LABELS\[group\]\}/g, '{group.label}');
    replaced = replaced.replace(/item\.group === group/g, 'item.group === group.id');
    // We also need to add a check if the group has items?
    // Wait, the new requirement says: "Add the empty 'Inventory & Supply' group with its future children commented out."
    // If it's an empty group, it might just render the title and an empty list. Or maybe we only render if items exist OR if it's the inventory group?
    // "Add the empty 'Inventory & Supply' group with its future children commented out." implies we SHOULD render the empty group. But maybe we just let it render empty?
    return replaced;
  }
);

// Fix active state bug
// item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
content = content.replace(
  /item\.href === '\/admin' \? pathname === '\/admin' : pathname\.startsWith\(item\.href\);/,
  `item.href === '/admin' ? pathname === '/admin' : (pathname === item.href || pathname.startsWith(item.href + '/'));`
);

// Add Icon to NavLink
// Wait, I need to check where NavLink renders the label, and put the icon before it.
// <Link ...> {item.label} </Link>
content = content.replace(
  /className=\{clsx\([\s\S]*?\)\}\n\s*>\n\s*\{item\.label\}\n\s*<\/Link>/,
  (match) => {
    let before = match.substring(0, match.indexOf('{item.label}'));
    let after = match.substring(match.indexOf('{item.label}'));
    let iconRender = `
      <div className="flex items-center gap-3">
        {(() => {
          const Icon = ICON_MAP[item.icon];
          return Icon ? <Icon className="h-5 w-5 opacity-75" /> : null;
        })()}
        {item.label}
      </div>`;
    return before + iconRender + '\n    </Link>';
  }
);

fs.writeFileSync(file, content);
console.log('updated admin-shell.tsx');

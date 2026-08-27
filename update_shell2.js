const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'apps/web/src/components/admin/admin-shell.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /\{NAV_GROUPS\.map\(\(group\) => \(\s*<div key=\{group\.id\} className="mb-4">\s*<p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink\/40">\s*\{group\.label\}\s*<\/p>\s*<ul className="space-y-0\.5">\s*\{items\s*\.filter\(\(item\) => item\.group === group\.id\)\s*\.map\(\(item\) => \(\s*<li key=\{item\.key\}>\s*<NavLink item=\{item\} pathname=\{pathname\} onClick=\{[\s\S]*?\} \/>\s*<\/li>\s*\)\)\}\s*<\/ul>\s*<\/div>\s*\)\}/g,
  `{NAV_GROUPS.map((group) => {
                const groupItems = items.filter((item) => item.group === group.id);
                if (groupItems.length === 0) return null;
                return (
                  <div key={group.id} className="mb-4">
                    <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink/40">
                      {group.label}
                    </p>
                    <ul className="space-y-0.5">
                      {groupItems.map((item) => (
                        <li key={item.key}>
                          <NavLink item={item} pathname={pathname} onClick={() => setIsNavOpen(false)} />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}`
);

content = content.replace(
  /\{NAV_GROUPS\.map\(\(group\) => \(\s*<div key=\{group\.id\} className="mb-4">\s*<p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink\/40">\s*\{group\.label\}\s*<\/p>\s*<ul className="space-y-0\.5">\s*\{items\s*\.filter\(\(item\) => item\.group === group\.id\)\s*\.map\(\(item\) => \(\s*<li key=\{item\.key\}>\s*<NavLink item=\{item\} pathname=\{pathname\} \/>\s*<\/li>\s*\)\)\}\s*<\/ul>\s*<\/div>\s*\)\}/g,
  `{NAV_GROUPS.map((group) => {
              const groupItems = items.filter((item) => item.group === group.id);
              if (groupItems.length === 0) return null;
              return (
                <div key={group.id} className="mb-4">
                  <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink/40">
                    {group.label}
                  </p>
                  <ul className="space-y-0.5">
                    {groupItems.map((item) => (
                      <li key={item.key}>
                        <NavLink item={item} pathname={pathname} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}`
);

fs.writeFileSync(file, content);
console.log('fixed conditional rendering of groups');

const fs = require('fs');
const file = 'apps/web/src/components/admin/nav-registry.ts';
let content = fs.readFileSync(file, 'utf8');

// Use regex to remove duplicate users block
content = content.replace(/\{\s*key:\s*'users'[\s\S]*?group:\s*'settings',\s*\},[\s\S]*?\{\s*key:\s*'users'[\s\S]*?group:\s*'settings',\s*\}/, `{\n    key: 'users',\n    label: 'Team & Access',\n    href: '/admin/users',\n    permissions: ['users.manage'],\n    group: 'settings',\n  }`);

fs.writeFileSync(file, content);

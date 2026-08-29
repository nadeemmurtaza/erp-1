const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get all files from git grep
const output = execSync('git grep -l "/api/admin/" apps/web/src', { encoding: 'utf8' });
const files = output.trim().split('\n').filter(Boolean);

for (const rel of files) {
  let content = fs.readFileSync(rel, 'utf8');
  content = content.replace(/\/api\/admin\//g, '/admin/');
  fs.writeFileSync(rel, content);
  console.log('Fixed:', rel);
}

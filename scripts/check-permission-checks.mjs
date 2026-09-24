#!/usr/bin/env node
/**
 * WO-2.8 (docs/implementation/admin-platform/02-admin-shell.md): a permission check in the
 * admin UI goes through `useAdminSession().can(key)`, never a raw
 * `something.permissions.includes('literal-string')`.
 *
 * The raw form has a real failure mode this check exists to close off: typed
 * loosely (or read off `getStoredUser()`, a non-reactive localStorage read),
 * a misspelled key does not fail a build — it silently, permanently returns
 * `false`, which reads as "no permission" instead of "no such permission
 * exists". At its worst this repo had ~30 admin pages each re-deriving the
 * same check by hand, several from `getStoredUser()` (a snapshot at call
 * time) instead of the reactive session context, so two checks in the same
 * render could disagree after a session refresh. `useAdminSession().can()`
 * is one implementation, typed against `PermissionKey`, so a typo is a
 * `pnpm typecheck` failure instead of a silent always-false.
 *
 * Scoped to `apps/web/src` — the admin UI is the only surface with a
 * `useAdminSession()` to call. Not run over apps/pos or apps/api, which have
 * no such hook and enforce permissions server-side regardless.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve('.');
const SEARCH_ROOT = 'apps/web/src';
const SOURCE_EXT = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage']);

/** The pattern this check forbids: a property-access permission check. A
 * bare `permissions.includes(` on a local variable (nav-registry.ts's own
 * `landingFor`/`navFor`, which take `permissions` as an explicit parameter,
 * not a `.permissions` field read off some object) is a different, legitimate
 * pattern and is not matched by this — it requires the leading dot. */
const PATTERN = /\.permissions\.includes\(/;

/**
 * Files allowed to contain the pattern, each with the reason — not a path
 * prefix skip, so a *new* raw check anywhere else in the file still fails.
 */
const ALLOWLIST = [
  {
    file: 'apps/web/src/components/admin/session.tsx',
    reason: "the can() helper's own implementation — the one place this check has to live",
  },
];

function isAllowed(file, line) {
  return ALLOWLIST.some((entry) => entry.file === file && line.includes('.permissions.includes('));
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full, out);
    } else if (SOURCE_EXT.has(name.slice(name.lastIndexOf('.')))) {
      out.push(full);
    }
  }
  return out;
}

function findViolations() {
  const violations = [];
  for (const absPath of walk(join(ROOT, SEARCH_ROOT))) {
    const relPath = relative(ROOT, absPath).split('\\').join('/');
    if (relPath.endsWith('.spec.ts') || relPath.endsWith('.spec.tsx')) continue;

    const lines = readFileSync(absPath, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (!PATTERN.test(line)) return;
      if (isAllowed(relPath, line)) return;
      violations.push({ file: relPath, line: index + 1, text: line.trim() });
    });
  }
  return violations;
}

function selfTest() {
  const cases = [
    { text: "const canManage = user?.permissions.includes('bom.manage') ?? false;", shouldMatch: true },
    { text: "const canManage = getStoredUser()?.permissions.includes('bom.manage');", shouldMatch: true },
    { text: "const { can } = useAdminSession();", shouldMatch: false },
    { text: "const canManage = can('bom.manage');", shouldMatch: false },
    { text: "!item.permissions || item.permissions.some((key) => permissions.includes(key));", shouldMatch: false },
  ];

  let failed = 0;
  for (const { text, shouldMatch } of cases) {
    const matched = PATTERN.test(text);
    const ok = matched === shouldMatch;
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${shouldMatch ? 'catches' : 'ignores'}: ${text}`);
  }

  if (failed > 0) {
    console.error(`\n${failed} self-test case(s) failed — the matcher does not do what this file says it does.\n`);
    process.exit(1);
  }
  console.log(`\nSelf-test OK (${cases.length} cases).`);
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  const violations = findViolations();
  if (violations.length === 0) {
    console.log('Permission checks: every one goes through useAdminSession().can().');
    return;
  }

  console.error('\nWO-2.8 violations — raw permission checks instead of useAdminSession().can():\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}\n    ${v.text}\n`);
  }
  console.error(
    `Replace with useAdminSession().can('key') — see apps/web/src/components/admin/session.tsx.\n` +
      `If this really is a new, legitimate exception, add it to ALLOWLIST in this file with a reason.\n`,
  );
  process.exit(1);
}

main();

#!/usr/bin/env node
/**
 * Enforces WO-A.2's own rule (10-admin-dashboard.md D9): `recharts` (or
 * `@visx/*` under the documented fallback) is imported ONLY from inside
 * `apps/web/src/components/admin/charts/`. Every other page or component
 * goes through that folder's wrapper components instead — one themed,
 * accessible chart vocabulary for the whole back office, not twenty-five
 * hand-rolled ones.
 *
 * Same shape and exit-code behaviour as check-module-boundaries.mjs, wired
 * into the root `lint` script the same way.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const WEB_SRC = resolve('apps/web/src');
const CHARTS_DIR = resolve('apps/web/src/components/admin/charts');
const CHART_LIBRARIES = [/^recharts(\/|$)/, /^@visx\//];
const IMPORT_PATTERN = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(name)) {
      files.push(full);
    }
  }
  return files;
}

function main() {
  const violations = [];

  for (const file of walk(WEB_SRC)) {
    const insideCharts = file === CHARTS_DIR || relative(CHARTS_DIR, file).startsWith('..') === false;
    if (insideCharts) continue;

    const content = readFileSync(file, 'utf8');
    let match;
    IMPORT_PATTERN.lastIndex = 0;
    while ((match = IMPORT_PATTERN.exec(content))) {
      const specifier = match[1];
      if (CHART_LIBRARIES.some((pattern) => pattern.test(specifier))) {
        violations.push({ file: relative(process.cwd(), file), specifier });
      }
    }
  }

  if (violations.length === 0) {
    console.log('Chart imports OK (recharts/@visx confined to components/admin/charts/)');
    return;
  }

  console.error('\nChart import violations:\n');
  for (const violation of violations) {
    console.error(`  ${violation.file}\n    imports "${violation.specifier}" outside components/admin/charts/\n`);
  }
  console.error(
    `recharts (and the @visx/* fallback) may only be imported from\n` +
      `apps/web/src/components/admin/charts/ — every page or block uses the wrapper\n` +
      `components exported from that folder's index.ts instead.\n` +
      `See docs/implementation/admin-platform/10-admin-dashboard.md, decision D9.\n`,
  );
  process.exit(1);
}

main();

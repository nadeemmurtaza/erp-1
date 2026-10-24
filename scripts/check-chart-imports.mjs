#!/usr/bin/env node
/**
 * Enforces WO-A.2's own rule (10-admin-dashboard.md D9): `recharts` (or
 * `@visx/*` under the documented fallback) is imported ONLY from inside
 * `apps/web/src/components/admin/charts/`. Every other page or component
 * goes through that folder's wrapper components instead — one themed,
 * accessible chart vocabulary for the whole back office, not twenty-five
 * hand-rolled ones.
 *
 * Second rule, same script: the two pre-Recharts charts that still sit beside
 * the folder (`components/admin/funnel-chart.tsx`, `gauge-chart.tsx`) have
 * newer twins of the same name inside it, with another API and another look
 * (`charts/funnel-chart.tsx`: a conversion table and a "largest drop" tag;
 * `charts/gauge-chart.tsx`: goals and limits with a state badge). Importing the
 * old ones is held to the three files that did when this was written, a
 * ratchet that may shrink and may not grow: a new screen takes the folder's own.
 * Moving those three is a change to what finance and the analytics blocks look
 * like, so it waits for a designer rather than being done mechanically.
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

/** The superseded twins, as imported (`@/components/admin/<name>`). */
const LEGACY_CHARTS = ['@/components/admin/funnel-chart', '@/components/admin/gauge-chart'];

/** The debt on the day the rule was written: who still imports a superseded twin, and why it has not moved. */
const LEGACY_IMPORTERS = new Set([
  // The finance page's net-margin gauge: a margin is not progress towards a goal, so the new gauge's "X of Y, Z to go" has nothing true to say.
  'apps/web/src/app/(admin)/admin/(app)/finance/page.tsx',
  // The report blocks take a basis-point percent and a money target as separate fields; the new gauge wants the achieved amount.
  'apps/web/src/components/admin/analytics/blocks/gauge-block.tsx',
  // The funnel block would gain the conversion table and a two-stage minimum (the old one drew a single stage).
  'apps/web/src/components/admin/analytics/blocks/funnel-block.tsx',
]);

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
  const legacyFound = new Set();
  const legacyNew = [];

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
      if (LEGACY_CHARTS.includes(specifier)) {
        const rel = relative(process.cwd(), file);
        legacyFound.add(rel);
        if (!LEGACY_IMPORTERS.has(rel)) legacyNew.push({ file: rel, specifier });
      }
    }
  }

  const legacyStale = [...LEGACY_IMPORTERS].filter((file) => !legacyFound.has(file));
  if (legacyNew.length > 0 || legacyStale.length > 0) {
    console.error('\nSuperseded chart imports:\n');
    for (const hit of legacyNew) {
      console.error(`  ${hit.file}\n    imports "${hit.specifier}", which has a newer twin in components/admin/charts/\n`);
    }
    for (const file of legacyStale) {
      console.error(`  ${file}\n    no longer imports a superseded chart: remove it from LEGACY_IMPORTERS in this script\n`);
    }
    console.error('Import FunnelChart and GaugeChart from "@/components/admin/charts" instead.\n');
    process.exit(1);
  }

  if (violations.length === 0) {
    console.log(
      `Chart imports OK (recharts/@visx confined to components/admin/charts/; ${legacyFound.size} importers of a superseded twin, all in the baseline)`,
    );
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

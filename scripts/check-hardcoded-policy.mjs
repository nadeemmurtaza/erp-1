#!/usr/bin/env node
/**
 * architecture-patterns/127-policy-as-data-completeness-sweep.md (WO-127.1)
 * — a heuristic sweep for a business threshold, bracket, or rule still
 * living in application code rather than a data row (a `Setting`, a
 * `TaxRate`-shaped table, a `*Type`/`*Policy` model).
 *
 * Deliberately NOT wired into `pnpm lint`. This is a starting heuristic —
 * like `check-rebrand.mjs`'s own admission, a grep-based pass cannot tell
 * a genuine policy gap from an engineering constant (a retry count, a
 * query-safety bound, an algorithm's own tuning parameter) by itself. Its
 * job is surfacing candidates for a human to triage, per the document's
 * own three buckets:
 *
 *   1. already correctly a constant — no action
 *   2. a genuine policy gap — convert to a Setting/table, following the
 *      nearest existing sibling's exact pattern
 *   3. ambiguous — a human decision, recorded where it's made
 *
 * Run manually: `node scripts/check-hardcoded-policy.mjs`. Every current
 * hit has already been triaged once (2026-09-26) — see the doc's own
 * Status blockquote for the full disposition of each. A hit not listed
 * there is new since that pass and needs its own triage.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC = resolve('apps/api/src');
const SKIP_DIRS = new Set(['node_modules', 'generated', 'dist', 'coverage']);

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

/** Each pattern surfaces a different shape a hardcoded policy typically takes. */
const HEURISTICS = [
  { name: 'inline numeric threshold comparison', pattern: /if.*amount.*[<>]=?\s*\d{3,}/ },
  { name: 'THRESHOLD/LIMIT constant', pattern: /const [A-Z_]*(?:THRESHOLD|LIMIT)\s*=\s*\d/ },
  { name: 'DAYS/PERCENT/RATE/GRACE-shaped constant', pattern: /const [A-Z_]*(?:DAYS|PERCENT|RATE|GRACE)[A-Z_]*\s*=\s*\d/ },
];

function main() {
  const files = walk(SRC);
  const hits = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      for (const heuristic of HEURISTICS) {
        if (heuristic.pattern.test(line)) {
          hits.push({ file: relative(process.cwd(), file), line: index + 1, heuristic: heuristic.name, text: line.trim() });
        }
      }
    });
  }

  if (hits.length === 0) {
    console.log('No candidates found.');
    return;
  }

  console.log(`${hits.length} candidate(s) found — triage each into one of three buckets (see this script's own header):\n`);
  for (const hit of hits) {
    console.log(`  ${hit.file}:${hit.line}  [${hit.heuristic}]`);
    console.log(`    ${hit.text}`);
  }
  console.log(
    '\nSee architecture-patterns/127-policy-as-data-completeness-sweep.md for the last full triage pass and its own recorded findings.',
  );
}

main();

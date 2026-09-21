#!/usr/bin/env node
/**
 * Runs the repository's verification gates and prints only what you need.
 *
 * WHY THIS EXISTS. `pnpm test` prints roughly 4,000 lines. During the work that
 * produced this script every single invocation was piped through `grep` to
 * find the two lines that mattered — which is the clearest possible signal
 * that the default output is wrong for the reader. Turbo and Jest are built to
 * be watched by a human scrolling a terminal; an agent pays for every line.
 *
 * So: run the same gates, unchanged, and report a summary plus the actual
 * failure output when something fails. Green goes from ~4,000 lines to about
 * ten. Nothing is hidden — a failure prints its real output, because a
 * verification tool that swallows the error is worse than none.
 *
 *   pnpm check              lint, typecheck, test, index freshness
 *   pnpm check --build      the above plus the build
 *   pnpm check lint test    just those gates
 *   pnpm check --verbose    full output, as if you had run each by hand
 *
 * Exit code is non-zero if any gate failed, so CI and hooks can use it.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const WITH_BUILD = argv.includes('--build');
const named = argv.filter((a) => !a.startsWith('-'));

/**
 * The gates, in the order that fails fastest and most cheaply first — lint and
 * the index check take seconds, the test suite takes a minute, the build takes
 * longer still. A broken typecheck should not wait behind a full build.
 */
const GATES = [
  { name: 'index', label: 'index freshness', cmd: ['node', ['scripts/build-index.mjs', '--check']] },
  { name: 'lint', label: 'lint + boundaries + secrets + env', cmd: ['pnpm', ['lint']] },
  { name: 'typecheck', label: 'typecheck', cmd: ['pnpm', ['typecheck']] },
  { name: 'test', label: 'tests', cmd: ['pnpm', ['test']] },
  { name: 'build', label: 'build', cmd: ['pnpm', ['build']], optIn: true },
];

const selected = GATES.filter((g) => {
  if (named.length) return named.includes(g.name);
  return !g.optIn || WITH_BUILD;
});

if (selected.length === 0) {
  console.error(`No gate matched. Available: ${GATES.map((g) => g.name).join(', ')}`);
  process.exit(1);
}

/** Pulls the numbers worth reporting out of a gate's own output. */
function summarise(name, out) {
  const lines = out.split('\n');
  const find = (re) => lines.filter((l) => re.test(l)).map((l) => l.trim());

  if (name === 'test') {
    // Turbo prefixes every line with the package name
    // (`@newax/api:test: Tests: ...`), so anchoring to the start of the line
    // finds nothing — which is how this first reported task counts instead of
    // the test counts it exists to surface.
    const grab = (label) => {
      const totals = new Map();
      for (const l of lines) {
        const m = l.match(new RegExp(`(?:^|\\s)(\\S*?):?\\s*${label}:\\s*(.+)$`));
        if (!m) continue;
        const pkg = (l.match(/^(@[\w/-]+):/) ?? [])[1] ?? '';
        totals.set(`${pkg}|${label}`, m[2].trim());
      }
      return [...totals.values()];
    };
    const suites = grab('Test Suites');
    const tests = grab('Tests');
    const sum = (rows) => rows.reduce((acc, r) => {
      const passed = Number((r.match(/(\d+) passed/) ?? [])[1] ?? 0);
      const failed = Number((r.match(/(\d+) failed/) ?? [])[1] ?? 0);
      const total = Number((r.match(/(\d+) total/) ?? [])[1] ?? 0);
      return { passed: acc.passed + passed, failed: acc.failed + failed, total: acc.total + total };
    }, { passed: 0, failed: 0, total: 0 });
    if (!tests.length) return find(/Tasks:/)[0] ?? '';
    const s1 = sum(suites), t1 = sum(tests);
    const fail = t1.failed ? `, ${t1.failed} FAILED` : '';
    return `${t1.passed}/${t1.total} tests${fail} across ${s1.total} suites`;
  }
  if (name === 'lint') {
    // The check scripts each print one confirmation line worth keeping.
    return find(/OK \(|Route permissions:|boundaries OK|templates OK/).join('\n  ');
  }
  if (name === 'typecheck' || name === 'build') return find(/Tasks:/)[0] ?? '';
  return lines.filter(Boolean).slice(-1)[0] ?? '';
}

const results = [];
const started = Date.now();

for (const gate of selected) {
  process.stderr.write(`  running ${gate.label}… `);
  const t0 = Date.now();
  const [bin, args] = gate.cmd;
  const run = spawnSync(bin, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: VERBOSE ? 'inherit' : 'pipe',
    env: process.env,
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const out = VERBOSE ? '' : `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const ok = run.status === 0;
  process.stderr.write(`${ok ? 'ok' : 'FAILED'} (${secs}s)\n`);
  results.push({ gate, ok, out, secs });
  // Keep going after a failure: one run should report every broken gate, not
  // make you re-run to discover the next one.
}

console.log('');
for (const { gate, ok, out, secs } of results) {
  const mark = ok ? '✓' : '✗';
  const summary = VERBOSE ? '' : summarise(gate.name, out);
  console.log(`${mark} ${gate.label.padEnd(34)} ${secs.padStart(3)}s${summary ? `   ${summary.split('\n')[0]}` : ''}`);
  if (ok && summary && summary.includes('\n')) {
    for (const extra of summary.split('\n').slice(1)) console.log(`${' '.repeat(42)}${extra}`);
  }
}

const failed = results.filter((r) => !r.ok);
if (failed.length === 0) {
  console.log(`\nAll ${results.length} gate(s) passed in ${((Date.now() - started) / 1000).toFixed(0)}s.`);
  process.exit(0);
}

// A failure gets its real output. Truncated only at the point where more text
// stops helping — and it says so rather than quietly cutting.
console.log('');
for (const { gate, out } of failed) {
  console.log(`${'─'.repeat(70)}\n${gate.label} FAILED\n${'─'.repeat(70)}`);
  if (VERBOSE) { console.log('(output above)'); continue; }
  const lines = out.split('\n');
  const interesting = lines.filter((l) =>
    /●|✕|error|Error|FAIL|failed|Expected|Received|missing|drift|violation|✖|warning/i.test(l),
  );
  const show = interesting.length ? interesting : lines.filter(Boolean);
  const MAX = 60;
  console.log(show.slice(0, MAX).join('\n'));
  if (show.length > MAX) {
    console.log(`… ${show.length - MAX} more line(s). Re-run with --verbose, or: pnpm ${gate.name}`);
  }
}
console.log(`\n${failed.length} of ${results.length} gate(s) failed.`);
process.exit(1);

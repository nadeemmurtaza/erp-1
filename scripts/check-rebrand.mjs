#!/usr/bin/env node
/**
 * Enforces Law 1 for the *brand* axis: no brand literal in application code.
 *
 * "No hardcoding. No brand, locale or design literal in application code …
 * every one resolves through an import from `packages/shared/src/brand.ts`."
 * This codebase ships to more than one client, so a client's name, domain,
 * email or order-number prefix left in a service is not untidiness — it is a
 * value that will be wrong, silently and confidently, the first time this is
 * deployed for somebody else.
 *
 * This replaces the hand-written grep that lived in CLAUDE.md, which had two
 * defects a script does not:
 *
 *   1. It searched for one hardcoded string — the current client's name. A
 *      grep that must be edited per client is a grep that will not be. Worse,
 *      it made the check itself an instance of the thing it forbids.
 *   2. It could not see a brand literal that does not contain that string.
 *      `brand.ts` says so in its own words, next to `orderNumberPrefix`: "it
 *      was written into the generator, where a case-insensitive search for the
 *      client's name would never find it."
 *
 * So the terms are *derived from `brand.ts`* rather than written here. Rebrand
 * the product and this check rebrands with it; there is nothing to remember.
 *
 * What is deliberately NOT searched, so the blind spots are stated rather than
 * discovered:
 *
 *   - Deployment configuration — `.env*.example`, `Caddyfile`, compose files,
 *     CI workflows. Law 1 scopes itself to *application code*, and a domain in
 *     an nginx-alike or a database name in an env template is environment
 *     config, which is per-deployment by definition. Whether those should be
 *     brand-neutral too is a real question, but it is a separate decision with
 *     a separate answer — see `.claude/rules/configuration.md` — not something
 *     to smuggle in under this check.
 *   - Migrations. Forward-only and never edited (`.claude/rules/database.md`),
 *     so a brand literal in one is history, not a defect to fix.
 *   - `docs/`. Prose about a client may name the client.
 *
 * Run by `pnpm lint` and by CI. `node scripts/check-rebrand.mjs --self-test`
 * proves the matcher still catches a leak, which a run over a clean tree
 * cannot.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, basename } from 'node:path';

const ROOT = resolve('.');
const BRAND_FILE = 'packages/shared/src/brand.ts';

/* ── where application code lives ──────────────────────────────────────── */

const ROOTS = ['apps', 'packages'];
const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set([
  'node_modules', '.next', '.expo', 'dist', 'build',
  'generated', 'coverage', '.turbo', 'prisma',
]);

/**
 * Literals that stay, each with the reason it stays. An entry is a file plus
 * the exact line content that is allowed — not a blanket pass on the file, so
 * a *new* leak in an allowlisted file still fails.
 */
const ALLOWLIST = [
  {
    file: 'apps/api/src/core/auth/auth.constants.ts',
    contains: 'LEGACY_REFRESH_COOKIE',
    reason: 'the pre-rename cookie name, still read so the rename signs nobody out',
  },
  {
    file: 'apps/api/src/core/auth/auth.constants.ts',
    contains: 'LEGACY_CART_COOKIE',
    reason: 'the pre-rename cookie name, still read so the rename signs nobody out',
  },
];

/* ── the terms, derived from the brand file ────────────────────────────── */

/** `key: 'value'` inside the brand file, honouring the opening quote. */
function literal(source, key) {
  const m = source.match(new RegExp(`\\b${key}\\s*:\\s*(['"\`])([^'"\`]*)\\1`));
  return m ? m[2] : null;
}

/** A value that is a placeholder rather than a real brand fact. */
const isPlaceholder = (v) => /X{3,}/.test(v) || /^[\s0-]+$/.test(v.replace(/[A-Z]{2,}/g, ''));

function deriveTerms(source) {
  const terms = [];
  const note = [];

  // The registrable label of the domain — `yaseen.pk` -> `yaseen`. This is the
  // one term that catches the brand in every shape it takes in code: a cookie
  // prefix, a storage key, an export filename, an email address. The codebase
  // already derives it exactly this way (catalog-admin.controller.ts).
  const domain = literal(source, 'domain');
  if (!domain) throw new Error(`could not read identity.domain from ${BRAND_FILE}`);
  const label = domain.split('.')[0];
  if (label.length < 3) throw new Error(`domain label "${label}" is too short to search for safely`);
  terms.push({ term: label, kind: 'domain label', flags: 'i' });

  // The order-number prefix. Initials, so a search for the client's name will
  // never find it — the case this check exists to add over the old grep. Case
  // -sensitive and word-bounded, because three uppercase letters are otherwise
  // a common substring.
  const prefix = literal(source, 'orderNumberPrefix');
  if (prefix && prefix.length >= 3) terms.push({ term: prefix, kind: 'order-number prefix', flags: '', word: true });
  else if (prefix) note.push(`orderNumberPrefix "${prefix}" is under 3 characters — too short to search for without false positives, so it is NOT checked`);

  // The name in the second language. Non-ASCII, so it cannot false-positive,
  // and no ASCII search would ever have found it.
  const nameUr = literal(source, 'nameUr');
  if (nameUr && !/^[\x00-\x7F]*$/.test(nameUr)) terms.push({ term: nameUr, kind: 'name (second language)', flags: '' });

  // Exact contact and banking strings. Long and specific, so matching them
  // literally is safe, and several contain no part of the domain label.
  for (const key of ['email', 'url', 'phone', 'whatsapp', 'address', 'iban', 'facebook', 'instagram', 'tiktok', 'youtube']) {
    const v = literal(source, key);
    if (!v || v.length < 8 || isPlaceholder(v)) continue;
    if (v.toLowerCase().includes(label.toLowerCase())) continue; // already covered
    terms.push({ term: v, kind: `contact/banking (${key})`, flags: 'i' });
  }

  // The brand's own name may not share a root with its domain — "Beta Traders"
  // at "btpk.com". Say so rather than missing it silently; tokenising the name
  // is not safe automatically, because a name word is often also sector
  // vocabulary this repository uses as an identifier ("Stitching" is a module).
  const name = literal(source, 'name');
  const firstWord = name ? name.split(/\s+/)[0].replace(/[^A-Za-z]/g, '') : '';
  if (firstWord && !label.toLowerCase().includes(firstWord.toLowerCase())) {
    note.push(
      `brand name "${name}" does not share a root with the domain "${domain}", so the ` +
      `domain label alone may not catch it — check "${firstWord}" by hand, or add a term here`,
    );
  }

  return { terms, note };
}

/* ── matching ──────────────────────────────────────────────────────────── */

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function toRegExp({ term, flags, word }) {
  const body = word ? `\\b${escape(term)}\\b` : escape(term);
  return new RegExp(body, flags);
}

/**
 * A line that is only a comment.
 *
 * The brand name survives in comments that record *why* a hardcoded value was
 * removed; deleting those would lose the history of the rebrand. A brand name
 * in a *trailing* comment on a line of code is not excused — mixed in with
 * code is exactly where one hides.
 */
const isCommentLine = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

/** Every violation on one file's contents. Pure, so --self-test can drive it. */
export function scan(relPath, source, terms) {
  if (relPath === BRAND_FILE) return [];              // the brand file IS the brand
  if (/\.(spec|e2e-spec|test)\.[jt]sx?$/.test(basename(relPath))) return [];  // fixtures ship to no client
  const out = [];
  source.split('\n').forEach((line, i) => {
    if (isCommentLine(line)) return;
    for (const t of terms) {
      if (!toRegExp(t).test(line)) continue;
      if (ALLOWLIST.some((a) => a.file === relPath && line.includes(a.contains))) continue;
      out.push({ file: relPath, line: i + 1, kind: t.kind, term: t.term, text: line.trim() });
    }
  });
  return out;
}

/* ── walking ───────────────────────────────────────────────────────────── */

function* sourceFiles(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (SOURCE_EXT.has(entry.slice(entry.lastIndexOf('.')))) yield full;
  }
}

/** `apps/<x>/src` and `packages/<x>/src` — application code, nothing else. */
function sourceRoots() {
  const dirs = [];
  for (const top of ROOTS) {
    let workspaces;
    try { workspaces = readdirSync(join(ROOT, top)); } catch { continue; }
    for (const w of workspaces) {
      const src = join(ROOT, top, w, 'src');
      if (existsSync(src) && statSync(src).isDirectory()) dirs.push(src);
    }
  }
  return dirs;
}

/* ── self-test ─────────────────────────────────────────────────────────── */

function selfTest(terms) {
  const label = terms.find((t) => t.kind === 'domain label').term;
  const prefix = (terms.find((t) => t.kind === 'order-number prefix') ?? {}).term;
  const cases = [
    ['apps/web/src/x.ts', `export const SUPPORT = 'help@${label}.pk';`, true, 'a brand literal in code'],
    ['apps/web/src/x.tsx', `const F = () => <span>${label}</span>;`, true, 'a brand literal in JSX'],
    ['apps/api/src/x.ts', `export const N = 1; // ${label}`, true, 'a trailing comment on code'],
    ['apps/api/src/x.ts', `  // ${label} was removed here`, false, 'a whole-line comment'],
    ['apps/api/src/x.ts', `   * ${label} was removed here`, false, 'a block-comment body line'],
    ['apps/api/src/x.spec.ts', `expect(u).toBe('https://${label}.pk');`, false, 'a spec fixture'],
    [BRAND_FILE, `  domain: '${label}.pk',`, false, 'the brand file itself'],
    ['apps/api/src/core/auth/auth.constants.ts', `export const LEGACY_CART_COOKIE = '${label}_cart';`, false, 'an allowlisted line'],
    ['apps/api/src/core/auth/auth.constants.ts', `export const OTHER = '${label}_x';`, true, 'a NEW leak in an allowlisted file'],
    ['apps/web/src/x.ts', `import { BRAND } from '@newax/shared';`, false, 'the Newax package scope'],
  ];
  if (prefix) {
    cases.push(['apps/api/src/x.ts', `@ApiProperty({ example: '${prefix}' })`, true, 'the order-number prefix']);
    cases.push(['apps/api/src/x.ts', `const t = 'MYSNAKE';`, false, 'the prefix as a substring of a word']);
  }

  let failed = 0;
  for (const [file, line, shouldFail, what] of cases) {
    const hit = scan(file, line, terms).length > 0;
    const ok = hit === shouldFail;
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${shouldFail ? 'catches' : 'ignores'} ${what}`);
  }
  if (failed) {
    console.error(`\n${failed} self-test case(s) failed — the matcher does not do what this file says it does.\n`);
    process.exit(1);
  }
  console.log(`\nSelf-test OK (${cases.length} cases) — the matcher catches a leak and ignores every documented exception.`);
}

/* ── main ──────────────────────────────────────────────────────────────── */

function main() {
  const brandPath = join(ROOT, BRAND_FILE);
  if (!existsSync(brandPath)) {
    console.error(`\nCannot find ${BRAND_FILE}. This check derives its search terms from the\nbrand file; without it there is nothing to check, and printing OK would be a lie.\n`);
    process.exit(1);
  }

  let terms, note;
  try {
    ({ terms, note } = deriveTerms(readFileSync(brandPath, 'utf8')));
  } catch (error) {
    console.error(`\nCould not derive brand terms: ${error.message}\n\nThis check is only as good as the terms it reads from ${BRAND_FILE}.\nIt fails rather than passing vacuously.\n`);
    process.exit(1);
  }

  if (process.argv.includes('--self-test')) return selfTest(terms);

  const violations = [];
  let scanned = 0;
  for (const dir of sourceRoots()) {
    for (const file of sourceFiles(dir)) {
      const rel = relative(ROOT, file);
      scanned += 1;
      violations.push(...scan(rel, readFileSync(file, 'utf8'), terms));
    }
  }

  for (const n of note) console.log(`Note: ${n}`);

  if (violations.length === 0) {
    console.log(
      `Rebrand check OK (${scanned} source files, ${terms.length} term(s) from ${BRAND_FILE}: ` +
      `${terms.map((t) => t.kind).join(', ')})`,
    );
    return;
  }

  console.error('\nLaw 1 violations — brand literals in application code:\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}\n    ${v.kind} "${v.term}" appears in: ${v.text}\n`);
  }
  console.error(
    `This codebase ships to more than one client, so each of these is a value that\n` +
    `will be wrong the first time it is deployed for somebody else. Import it from\n` +
    `${BRAND_FILE} instead — \`import { BRAND } from '@newax/shared'\`.\n\n` +
    `A literal that genuinely must stay (a pre-rename constant read for compatibility)\n` +
    `goes in ALLOWLIST in this file, with the reason. Not a blanket pass on the file.\n`,
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

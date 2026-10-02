#!/usr/bin/env node
/**
 * Enforces MNU-6 and MNU-2: the controls that have a contract are used, not
 * re-derived from a native element.
 *
 * `docs/design/components-states/03-components.md` ("Controls with a contract") says:
 *
 *   MNU-6  fewer than five options is a segmented control or a radio group, not a
 *          menu — "Active / Archived" is not a dropdown. `Select` decides this from
 *          the option count, so a call site does not.
 *   MNU-2  a date field is a text field that parses what is typed, with a month and
 *          year jump — `DateField`, not `<input type="date">`.
 *
 * What it counts in `apps/*\/src/**\/*.tsx` (spec files excluded):
 *
 *   (a) a native `<select>` whose options are all written out (1 to 4 literal
 *       `<option>`, and no `.map(` building more). That list is short and fixed
 *       and is exactly what MNU-6 says must not be a menu. Target: none.
 *   (b) a native `type="date"` input. Target: none; whatever remains is in BASELINE
 *       and is a page the migration could not mechanically convert.
 *   (c) every native `<select>`, for information only. A native select is
 *       OS-handled, collision-aware and accessible at 5 to 10 options, so (c) is
 *       never a failure; it is how much of MNU-1 and MNU-4 still rests on the
 *       platform, printed so the number is seen.
 *
 * A ratchet, not a wish: BASELINE is the debt that existed when the check was
 * written. The counts may shrink and may not grow. A run below the baseline
 * passes and says so, so the baseline is lowered in the same change and cannot
 * quietly regrow to where it was.
 *
 * What it cannot see, stated so a green run is not read as more than it is: a
 * `<select>` built with a spread (`<select {...props}>`) or hidden behind a local
 * wrapper component, and a `<select>` whose options come from a helper call (it
 * has no literal `<option>`, so it is not counted as short). Comments are blanked
 * before matching, so prose that mentions `<select>` does not count.
 *
 *   node scripts/check-menus.mjs             # scan apps/*\/src
 *   node scripts/check-menus.mjs --self-test # prove the matcher still works
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve('.');
const APPS = ['apps/web/src', 'apps/pos/src', 'apps/mobile'].map((dir) => join(ROOT, dir));
const SKIP_DIRS = new Set(['node_modules', '.next', '.expo', 'dist', 'build', 'generated', 'coverage', '.turbo']);

/**
 * The debt on the day this check was written, after the first migration. Lower
 * a number here in the same change that removes the last of its kind; never raise one.
 */
export const BASELINE = {
  /** (a) MNU-6: native selects with 1 to 4 literal options and no `.map(`. */
  shortSelects: 0,
  /**
   * (b) MNU-2: native `type="date"` inputs. One remains on purpose:
   * `MetadataDrivenForm` may compose only plain elements and the `.field-*`
   * classes (architecture-patterns/141 §2, held by `check-metadata-renderer.mjs`),
   * so it cannot import `DateField`. Giving the renderer a date control is a
   * decision about that guardrail, not a migration.
   */
  nativeDates: 1,
};

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (name.endsWith('.tsx') && !/\.(spec|test)\.tsx$/.test(name)) yield path;
  }
}

/** Blank comments to spaces, keeping every newline, so line numbers still point at the source. */
export function blankComments(source) {
  const blank = (text) => text.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[\s;{(,])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** Every native `<select>` block: its line, how many literal `<option>` it has, and whether it maps more. */
export function findSelects(source) {
  const text = blankComments(source);
  const out = [];
  for (const open of text.matchAll(/<select(?=[\s>])/g)) {
    const end = text.indexOf('</select>', open.index);
    const block = end === -1 ? text.slice(open.index) : text.slice(open.index, end);
    out.push({
      line: lineOf(text, open.index),
      options: (block.match(/<option(?=[\s>])/g) ?? []).length,
      mapped: /\.map\s*\(/.test(block),
    });
  }
  return out;
}

/** The line of every native date input: `type="date"`, `type='date'` or `type={'date'}`. */
export function findDateInputs(source) {
  const text = blankComments(source);
  return [...text.matchAll(/\btype\s*=\s*(?:\{\s*)?["'`]date["'`]/g)].map((m) => lineOf(text, m.index));
}

/** MNU-6: a list written out in full, short enough that it should be visible. */
export const isShortSelect = (s) => s.options >= 1 && s.options <= 4 && !s.mapped;

function scan() {
  const short = [];
  const dates = [];
  let total = 0;
  let files = 0;
  for (const root of APPS) {
    for (const file of walk(root)) {
      files += 1;
      const source = readFileSync(file, 'utf8');
      const rel = relative(ROOT, file);
      for (const s of findSelects(source)) {
        total += 1;
        if (isShortSelect(s)) short.push({ file: rel, line: s.line, options: s.options });
      }
      for (const line of findDateInputs(source)) dates.push({ file: rel, line });
    }
  }
  return { short, dates, total, files };
}

function selfTest() {
  const cases = [];
  const check = (what, ok) => cases.push([what, ok]);

  const four = `<select value={a}>\n<option value="1">A</option><option value="2">B</option>\n<option value="3">C</option><option>D</option></select>`;
  const five = `<select>${'<option>x</option>'.repeat(5)}</select>`;
  const mapped = `<select>\n<option value="">None</option>\n{items.map((i) => <option key={i}>{i}</option>)}\n</select>`;
  const dynamic = `<select>{renderOptions()}</select>`;

  check('flags a select with four literal options', findSelects(four).map(isShortSelect)[0] === true);
  check('counts every literal option', findSelects(four)[0].options === 4);
  check('does not flag five literal options', findSelects(five).map(isShortSelect)[0] === false);
  check('does not flag a select that maps more options', findSelects(mapped).map(isShortSelect)[0] === false);
  check('does not flag a select with no literal option to count', findSelects(dynamic).map(isShortSelect)[0] === false);
  check('reports the line of the opening tag', findSelects(`a\nb\n${four}`)[0].line === 3);
  check('finds two selects in one file', findSelects(`${four}\n${five}`).length === 2);
  check('ignores a tag that only starts with the word select', findSelects('<selection>x</selection>').length === 0);
  check('ignores a select named in a block comment', findSelects('/* a native <select> */ <div />').length === 0);
  check('ignores a select named in a line comment', findSelects('// <select> here\n<div />').length === 0);
  check(
    'keeps line numbers across a blanked comment',
    findSelects('/*\n\n*/\n<select><option>a</option></select>')[0].line === 4,
  );

  check('finds type="date"', findDateInputs('<input type="date" />').length === 1);
  check("finds type='date'", findDateInputs("<input type='date' />").length === 1);
  check("finds type={'date'}", findDateInputs("<input type={'date'} />").length === 1);
  check('does not count datetime-local', findDateInputs('<input type="datetime-local" />').length === 0);
  check('does not count type="text"', findDateInputs('<input type="text" />').length === 0);
  check('does not count a date mentioned in a comment', findDateInputs('// <input type="date">\n<div />').length === 0);
  check('reports the line of a date input', findDateInputs('<div>\n<input\n type="date"\n/></div>')[0] === 3);

  let failed = 0;
  for (const [what, ok] of cases) {
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  }
  if (failed) {
    console.error(`\n${failed} self-test case(s) failed — the matcher does not do what this file says it does.\n`);
    process.exit(1);
  }
  console.log(`\nSelf-test OK (${cases.length} cases) — selects, options and date inputs are read as documented.`);
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  const { short, dates, total, files } = scan();
  if (files === 0) {
    // Zero files read is not "no violations": it is a moved folder or a wrong working directory.
    console.error('Menus scanned 0 files. Run from the repository root.');
    process.exit(1);
  }
  const over = [];
  const under = [];
  for (const [key, label, found] of [
    ['shortSelects', 'MNU-6 — native <select> with 1 to 4 literal options and no .map(', short],
    ['nativeDates', 'MNU-2 — native type="date" input', dates],
  ]) {
    const count = found.length;
    if (count > BASELINE[key]) over.push({ label, found, count, allowed: BASELINE[key] });
    else if (count < BASELINE[key]) under.push({ key, count, allowed: BASELINE[key] });
  }

  console.log(
    `Scanned ${files} files. Native <select> in total: ${total} (information only: at 5 to 10 options the platform's own menu is accessible and collision-aware). ` +
      `Short selects (MNU-6): ${short.length}. Native date inputs (MNU-2): ${dates.length}.`,
  );

  if (under.length) {
    for (const u of under)
      console.log(
        `  baseline for ${u.key} is ${u.allowed} and the count is ${u.count}: lower BASELINE.${u.key} to ${u.count} in scripts/check-menus.mjs.`,
      );
  }

  if (over.length === 0) {
    console.log('Menus OK — no more native selects or date inputs than the baseline allows.');
    return;
  }

  for (const o of over) {
    console.error(`\n${o.label}: ${o.count} found, ${o.allowed} allowed.\n`);
    for (const f of o.found)
      console.error(`  ${f.file}:${f.line}${f.options ? `  (${f.options} option${f.options === 1 ? '' : 's'})` : ''}`);
  }
  console.error(
    `\nA list of four or fewer is a segmented control, not a menu (MNU-6), and a date is a text field that\n` +
      `parses what is typed (MNU-2). Use \`Select\` (it chooses by option count) and \`DateField\` from\n` +
      `apps/web/src/components/ui. See docs/design/components-states/03-components.md, "Controls with a contract".\n`,
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

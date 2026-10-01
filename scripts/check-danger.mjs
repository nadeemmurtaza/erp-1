#!/usr/bin/env node
/**
 * DNG-2: a destructive control is labelled with a verb and its object, never
 * "Yes", "OK" or "Confirm".
 *
 * A button that says "Yes" makes the reader work out what it refers to, which is
 * the moment a person agrees to the wrong thing. The rule is held on the four
 * places a destructive label is written as a literal:
 *
 *   - `confirmLabel="…"` on a `ConfirmDialog`
 *   - the text of a `<Button variant="danger">`
 *   - the text of a `<HoldToConfirm>`
 *   - the text of any element carrying the `btn-danger` class
 *
 * The list of vague words is not repeated here: it is read from
 * `apps/web/src/lib/guard.ts` (`VAGUE_LABELS`), the same set `isVagueLabel`
 * tests at run time, so there is one list to edit and the two cannot drift.
 *
 * A label that is not a literal (a template, a ternary, a prop) cannot be read
 * statically; those are counted and reported, not failed, because an expression
 * is not evidence of a vague word. `isVagueLabel` is there for the code that
 * builds one.
 *
 * What this does NOT check, stated so a green run is not read as more than it is:
 * the red budget (DNG-4: red on destruction only) and the danger zone's place at
 * the end of a page (DNG-5) both need a render, and cooldown (DNG-6) is a
 * product rule. They are reviewed, not linted.
 *
 *   node scripts/check-danger.mjs             # scan apps/*\/src
 *   node scripts/check-danger.mjs --self-test # prove the matcher still works
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const GUARD = resolve('apps/web/src/lib/guard.ts');
const ROOTS = ['apps/web/src', 'apps/pos/src'].map((root) => resolve(root));

/** The vague words, read from the one place they are defined. */
export function readVagueLabels(source) {
  const match = /VAGUE_LABELS\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(source);
  if (!match) throw new Error('check-danger: could not find VAGUE_LABELS in guard.ts');
  return new Set([...match[1].matchAll(/'([^']+)'/g)].map((word) => word[1]));
}

/** Same normalisation as `isVagueLabel`: trim, lower-case, drop trailing punctuation. */
export function isVague(label, vague) {
  const word = label
    .trim()
    .toLowerCase()
    .replace(/[\s.!…]+$/u, '');
  return word.length === 0 || vague.has(word);
}

/**
 * The end of the opening tag that starts at `from` (which points at `<`),
 * skipping `>` inside `{…}` (an arrow function) and inside quotes.
 */
function tagEnd(text, from) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (depth === 0 && (char === '"' || char === "'")) quote = char;
    else if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '>' && depth === 0 && text[i - 1] !== '=') return i;
  }
  return -1;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** Every destructive label written as a literal in `text`, and the count of those that are expressions. */
export function findLabels(text) {
  const labels = [];
  let dynamic = 0;

  for (const match of text.matchAll(/confirmLabel=(?:"([^"]*)"|\{\s*['"`]([^'"`$]*)['"`]\s*\})/g)) {
    labels.push({ label: match[1] ?? match[2], index: match.index, where: 'confirmLabel' });
  }
  dynamic += (text.match(/confirmLabel=\{(?!\s*['"`][^'"`$]*['"`]\s*\})/g) ?? []).length;

  for (const open of text.matchAll(/<(Button|HoldToConfirm|button|a)\b/g)) {
    const end = tagEnd(text, open.index);
    if (end === -1) continue;
    const attrs = text.slice(open.index, end);
    const danger = /variant=["']danger["']/.test(attrs) || /\bbtn-danger\b/.test(attrs) || open[1] === 'HoldToConfirm';
    if (!danger) continue;
    if (text[end - 1] === '/') continue; // self-closing: no children to read
    const child = /^([^<{]*)/.exec(text.slice(end + 1))[1];
    if (child.trim().length > 0) labels.push({ label: child, index: end + 1, where: open[1] });
    else dynamic += 1;
  }

  return { labels, dynamic };
}

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (/\.tsx$/.test(name) && !/\.spec\.tsx$/.test(name)) files.push(full);
  }
  return files;
}

function selfTest() {
  const vague = readVagueLabels(readFileSync(GUARD, 'utf8'));
  const failures = [];
  const expect = (name, ok) => {
    if (!ok) failures.push(name);
  };

  expect('reads the vague set', vague.has('yes') && vague.has('confirm') && !vague.has('delete'));
  expect('flags Yes', isVague('Yes', vague));
  expect('flags trailing punctuation', isVague('OK.', vague));
  expect('flags empty', isVague('  ', vague));
  expect('passes a verb and object', !isVague('Delete project', vague));
  expect('passes a verb that starts with a vague word', !isVague('Confirm delivery', vague));

  const dialog = findLabels('<ConfirmDialog confirmLabel="Yes" onConfirm={() => go()} />');
  expect('reads a literal confirmLabel', dialog.labels.length === 1 && dialog.labels[0].label === 'Yes');

  const braced = findLabels("<ConfirmDialog confirmLabel={'Revoke key'} />");
  expect('reads a braced literal', braced.labels[0]?.label === 'Revoke key');

  const expression = findLabels('<ConfirmDialog confirmLabel={busy ? a : b} />');
  expect('counts an expression, does not fail it', expression.labels.length === 0 && expression.dynamic === 1);

  const arrow = findLabels('<Button variant="danger" onClick={() => setOpen(false)}>Confirm</Button>');
  expect('reads past an arrow function in an attribute', arrow.labels[0]?.label === 'Confirm');

  const hold = findLabels('<HoldToConfirm onConfirm={run}>Delete project</HoldToConfirm>');
  expect('reads a HoldToConfirm label', hold.labels[0]?.label === 'Delete project');

  const klass = findLabels('<button type="button" className="btn btn-danger">OK</button>');
  expect('reads a btn-danger element', klass.labels[0]?.label === 'OK');

  const plain = findLabels('<Button variant="secondary">Yes</Button>');
  expect('ignores a button that is not destructive', plain.labels.length === 0);

  const selfClosing = findLabels('<Button variant="danger" />');
  expect('self-closing has no label to read', selfClosing.labels.length === 0 && selfClosing.dynamic === 0);

  if (failures.length > 0) {
    console.error(`check-danger self-test FAILED: ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log('check-danger self-test OK');
}

function main() {
  if (process.argv.includes('--self-test')) {
    selfTest();
    return;
  }

  const vague = readVagueLabels(readFileSync(GUARD, 'utf8'));
  const violations = [];
  let checked = 0;
  let dynamic = 0;

  for (const root of ROOTS) {
    let files;
    try {
      files = walk(root);
    } catch {
      continue; // an app that is not in this checkout
    }
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const found = findLabels(text);
      dynamic += found.dynamic;
      for (const { label, index, where } of found.labels) {
        checked += 1;
        if (isVague(label, vague)) {
          violations.push({
            file: relative(process.cwd(), file),
            line: lineOf(text, index),
            label: label.trim(),
            where,
          });
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log(
      `Danger labels OK (${checked} literal labels checked, ${dynamic} written as expressions and not checked)`,
    );
    return;
  }

  console.error('\nVague destructive labels (DNG-2):\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}\n    ${v.where} says "${v.label}"\n`);
  }
  console.error(
    'A destructive control names the act and its object ("Delete project", "Void 3 sales").\n' +
      'See docs/design/components-states/03-components.md, DNG-2.\n',
  );
  process.exit(1);
}

main();

#!/usr/bin/env node
/**
 * Enforces CPY-5 and CPY-3: the clipboard is touched in one place.
 *
 * `docs/design/components-states/03-components.md` ("CPY · Copy") says a copy
 * button proves its result, copies the raw value, and falls back to the copy
 * command where the async API does not exist. All of that is one function,
 * `copyText` in `apps/web/src/lib/copy.ts`, and one component that uses it,
 * `CopyButton`. A second call site would be a second implementation of every
 * rule above: one that fails silently on an insecure origin, copies a formatted
 * span, or never shows a result. So this check fails on any other.
 *
 * What it counts in `apps/web/src` and `apps/pos/src` (`.ts` and `.tsx`, spec
 * files excluded, the one allowed file excluded):
 *
 *   (a) `navigator.clipboard`, however it is reached: `navigator.clipboard`,
 *       `navigator?.clipboard`, `window.navigator.clipboard` and
 *       `navigator['clipboard']`. Reading is counted as well as writing: a paste
 *       button that needs it adds a function next to `copyText`, where its
 *       failure path can be written once.
 *   (b) `document.execCommand('copy')` or `('cut')`, the fallback. Other commands
 *       (`'bold'` in an editor) are not the clipboard and are not counted.
 *
 * Target: none. There is no baseline, because the day this was written there
 * was nothing to grandfather: the one old call site (`SecretOnce`) was moved
 * onto `CopyButton` in the same change.
 *
 * What it cannot see, stated so a green run is not read as more than it is: a
 * clipboard reached through a computed key (`navigator[key]`), an alias
 * (`const nav = navigator; nav.clipboard`), or code that ships in a dependency;
 * and `apps/mobile`, which has no DOM clipboard (it would use
 * `expo-clipboard`, a different API and its own decision). Comments are blanked
 * before matching, so prose that names the API does not count. A property
 * assigned by name in a string (`Object.defineProperty(navigator, 'clipboard'`,
 * which the design-system specimen uses to stage a failure) is not a call and is
 * not counted.
 *
 *   node scripts/check-clipboard.mjs             # scan apps/web and apps/pos
 *   node scripts/check-clipboard.mjs --self-test # prove the matcher still works
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
// The comment blanker is exported and importing the module runs nothing (its main is guarded).
import { blankComments } from './check-menus.mjs';

const ROOT = resolve('.');
const APPS = ['apps/web/src', 'apps/pos/src'].map((dir) => join(ROOT, dir));
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'generated', 'coverage', '.turbo']);

/** The one place that may touch the clipboard, relative to the repository root. */
export const ALLOWED = ['apps/web/src/lib/copy.ts'];

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
    else if (/\.tsx?$/.test(name) && !/\.(spec|test)\.tsx?$/.test(name) && !name.endsWith('.d.ts')) yield path;
  }
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** `navigator.clipboard`, `navigator?.clipboard` and `navigator['clipboard']`, and so `window.navigator.clipboard` too. */
const API = /\bnavigator\s*(?:\??\.|\[\s*["'`])\s*clipboard\b/g;

/** `execCommand('copy')` and `execCommand("cut")`. */
const COMMAND = /\bexecCommand\s*\(\s*["'`](?:copy|cut)["'`]/g;

/** Every clipboard touch in one file: its line and which of the two it is. */
export function findClipboardUse(source) {
  const text = blankComments(source);
  const out = [];
  for (const m of text.matchAll(API)) out.push({ line: lineOf(text, m.index), kind: 'navigator.clipboard' });
  for (const m of text.matchAll(COMMAND)) out.push({ line: lineOf(text, m.index), kind: "execCommand('copy')" });
  return out.sort((a, b) => a.line - b.line);
}

function scan() {
  const found = [];
  let files = 0;
  for (const root of APPS) {
    for (const file of walk(root)) {
      const rel = relative(ROOT, file).split('\\').join('/');
      if (ALLOWED.includes(rel)) continue;
      files += 1;
      for (const use of findClipboardUse(readFileSync(file, 'utf8'))) found.push({ file: rel, ...use });
    }
  }
  return { found, files };
}

function selfTest() {
  const cases = [];
  const check = (what, ok) => cases.push([what, ok]);
  const kinds = (source) => findClipboardUse(source).map((u) => u.kind);

  check('flags navigator.clipboard.writeText', kinds('await navigator.clipboard.writeText(x);')[0] === 'navigator.clipboard');
  check('flags a read as well as a write', kinds('const s = await navigator.clipboard.readText();').length === 1);
  check('flags navigator?.clipboard', kinds('navigator?.clipboard?.writeText(x)').length === 1);
  check('flags window.navigator.clipboard', kinds('window.navigator.clipboard.writeText(x)').length === 1);
  check("flags navigator['clipboard']", kinds("navigator['clipboard'].writeText(x)").length === 1);
  check('flags navigator["clipboard"] with a space', kinds('navigator [ "clipboard" ].writeText(x)').length === 1);
  check("flags execCommand('copy')", kinds("document.execCommand('copy')")[0] === "execCommand('copy')");
  check('flags execCommand("cut")', kinds('document.execCommand("cut")').length === 1);
  check('flags execCommand with space inside the call', kinds("document.execCommand( 'copy' )").length === 1);
  check('does not flag another execCommand', kinds("document.execCommand('bold')").length === 0);
  check('does not flag a property named clipboard on another object', kinds('store.clipboard.items').length === 0);
  check('does not flag navigator.language', kinds('navigator.language').length === 0);
  check('does not flag a word that only starts with navigator', kinds('navigatorOptions.clipboard').length === 0);
  check(
    "does not flag the specimen's defineProperty by name",
    kinds("Object.defineProperty(navigator, 'clipboard', { value: undefined })").length === 0,
  );
  check('ignores a line comment', kinds('// navigator.clipboard.writeText(x)\nconst a = 1;').length === 0);
  check('ignores a block comment', kinds('/* document.execCommand("copy") */ const a = 1;').length === 0);
  check('reports the line of the use', findClipboardUse('a\nb\nnavigator.clipboard.writeText(x)')[0].line === 3);
  check(
    'keeps line numbers across a blanked comment',
    findClipboardUse('/*\n\n*/\nnavigator.clipboard.writeText(x)')[0].line === 4,
  );
  check(
    'reports both routes in one file, in line order',
    kinds("document.execCommand('copy');\nnavigator.clipboard.writeText(x);").join() === "execCommand('copy'),navigator.clipboard",
  );
  check('allows exactly the one file, by its path', ALLOWED.length === 1 && ALLOWED[0] === 'apps/web/src/lib/copy.ts');

  let failed = 0;
  for (const [what, ok] of cases) {
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  }
  if (failed) {
    console.error(`\n${failed} self-test case(s) failed — the matcher does not do what this file says it does.\n`);
    process.exit(1);
  }
  console.log(`\nSelf-test OK (${cases.length} cases) — clipboard use is read as documented.`);
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  const { found, files } = scan();
  console.log(`Scanned ${files} files outside ${ALLOWED.join(', ')}. Clipboard calls found: ${found.length}.`);

  if (found.length === 0) {
    console.log('Clipboard OK — nothing touches it except lib/copy.ts.');
    return;
  }

  console.error('');
  for (const f of found) console.error(`  ${f.file}:${f.line}  ${f.kind}`);
  console.error(
    `\nCopying goes through \`CopyButton\` (apps/web/src/components/ui/copy-button.tsx), and the write itself is\n` +
      `\`copyText\` in apps/web/src/lib/copy.ts. A second call site is a second implementation of CPY-1 to CPY-5:\n` +
      `one that is silent on an insecure origin, copies a formatted span, or never shows a result. If the button\n` +
      `does not fit, extend \`copyText\` or \`CopyButton\`. See docs/design/components-states/03-components.md, "CPY · Copy".\n`,
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

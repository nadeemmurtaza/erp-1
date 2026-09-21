#!/usr/bin/env node
/**
 * Enforces COL-3 — text and meaningful boundaries meet their contrast floor.
 *
 * `docs/design/15-integrity.md` ranks this first of the ten integrity checks,
 * for one reason: it is the only one that needs neither a browser nor a
 * running app. A contrast ratio is arithmetic over two colours, and both
 * colours are already in this repository. Everything else in that build order
 * has to render something; this just has to read.
 *
 * WCAG 2.2 AA, which docs/design/07-accessibility.md sets as the floor:
 *
 *   4.5:1  body text (under 24px, or under 19px bold)
 *   3:1    large text, and the boundary of a control or meaningful graphic
 *
 * What it checks, and why only these two things:
 *
 *   1. STATED PAIRS — a className carrying both a foreground and a background
 *      token. Both colours are known, so the ratio is certain and a failure
 *      is a fact, not an inference.
 *
 *   2. FOREGROUNDS ON THE SURFACES THIS APP PAINTS — a token used without a
 *      background lands on whatever its ancestor painted. The set of those is
 *      small and knowable: the body background, plus every `bg-*` token the
 *      code actually uses. A foreground that misses the floor on *every* one
 *      of them cannot be correct anywhere, which again is a fact.
 *
 * What it cannot check, stated so the gap is not mistaken for a pass: which
 * surface a given element is actually on, and how big its text renders. Both
 * need the DOM. That is check 6 in the build order (a render harness) and it
 * does not exist yet — so a token that passes here may still be wrong in
 * place, and this check never claims otherwise.
 *
 * The palette is READ FROM `packages/shared/src/brand.ts`, never written
 * here. Law 1 puts every brand colour in that file; a checker with its own
 * copy of the palette would be the defect it is meant to catch, and would
 * silently stop being true the first time a client is rebranded.
 *
 * Run by `pnpm lint` and by CI. `--self-test` proves the colour maths against
 * published WCAG vectors, which a run over a clean tree cannot.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve('.');
const BRAND_FILE = 'packages/shared/src/brand.ts';
const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);
const SKIP_DIRS = new Set(['node_modules', '.next', '.expo', 'dist', 'build', 'generated', 'coverage', '.turbo']);

const FLOOR = { text: 4.5, large: 3, boundary: 3 };

/* ── colour maths (WCAG 2.x relative luminance) ────────────────────────── */

const parseHex = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};

const luminance = ([r, g, b]) => {
  const [R, G, B] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};

/** WCAG 2.x contrast ratio. Order-independent, 1:1 to 21:1. */
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** A translucent foreground has no colour of its own — composite it first. */
const composite = (fg, bg, alpha) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));

/* ── the palette, read from the brand file ─────────────────────────────── */

/**
 * Every `token: '#rrggbb'` under BRAND.theme.colors, flattened to the names
 * Tailwind actually generates: `neutral-500`, `accent`, `accent-hover`,
 * `white`, `feedback-negative`.
 */
function readPalette(source) {
  const start = source.indexOf('const colors = {');
  if (start === -1) throw new Error(`no 'const colors' block in ${BRAND_FILE}`);

  const palette = new Map();
  let depth = 0;
  // The group a colour belongs to, by nesting depth: `neutral` at depth 2
  // makes `neutral-500`, while `white` sits at depth 1 and keeps its own name.
  // Tracking it per depth rather than as one variable matters — a group that
  // is never cleared on `}` renames every later top-level colour after it.
  const groupAt = [];
  for (const raw of source.slice(start).split('\n')) {
    const line = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/, '');
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    const key = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*\{/);
    const hex = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*'(#[0-9a-fA-F]{3,8})'/);

    if (hex) {
      const [, name, value] = hex;
      const group = groupAt[depth - 1];
      const token = group ? (name === 'DEFAULT' ? group : `${group}-${name}`) : name;
      palette.set(token.toLowerCase(), parseHex(value));
    } else if (key) {
      groupAt[depth] = depth >= 1 ? key[1] : null;
    }

    depth += opens - closes;
    groupAt.length = Math.max(depth, 0) + 1;
    if (depth <= 0 && palette.size) break;
  }
  if (!palette.size) throw new Error(`read no colours from ${BRAND_FILE}`);
  return palette;
}

/* ── known failures, each with its reason ──────────────────────────────── */

/**
 * The debt this check found on the day it was written, and did not silently
 * fix: changing a brand colour is the client's decision (Law 1), and
 * re-toning 200+ call sites is a piece of work in its own right, not a
 * side-effect of adding a checker.
 *
 * `max` is a ratchet. A new failing token fails the build; so does using an
 * already-failing one more often than the day it was recorded. The debt can
 * shrink and cannot grow.
 */
const BASELINE = [
  // ── the secondary-text ramp ───────────────────────────────────────────
  //
  // `text-neutral-900/NN` is how this product has always written quieter
  // text, and the alpha steps below 60% do not reach 4.5:1 on any surface it
  // paints. This is ~227 call sites: a single deliberate pass to re-tone
  // them, not a side effect of adding a checker, and not a decision to make
  // silently — the tones carry the visual hierarchy (TYP-4, COG-12) and
  // raising them all flattens it.
  //
  // The remedy is small per site and known: /60 clears the floor at 4.93:1
  // on white and 4.75:1 on neutral-50. Whether every one of these should
  // become /60, or some should become larger or bolder instead, is a design
  // decision. Until it is made, the ratchet below stops the debt growing.
  { token: 'neutral-900/50', max: 148, reason: '3.54:1 — the standard secondary-text tone. /60 reaches 4.93:1.' },
  { token: 'neutral-900/40', max: 54, reason: '2.62:1 — tertiary text and hints.' },
  { token: 'neutral-900/45', max: 20, reason: '3.03:1 — tertiary text.' },
  { token: 'neutral-900/30', max: 4, reason: '1.99:1 — placeholder and empty-slot tones.' },
  { token: 'neutral-900/35', max: 1, reason: '2.28:1 — the command palette\'s search icon.' },

  // ── decorative boundaries ─────────────────────────────────────────────
  //
  // WCAG 1.4.11 governs a boundary that CONVEYS information — the outline of
  // a control, a chart segment. A rule between two rows conveys nothing the
  // spacing beside it does not (PER-1, PER-5), so it is under no floor.
  //
  // This is the one baseline entry that needs judgement to apply: the same
  // token used to mark a control's edge IS a violation and is not covered
  // here. The checker cannot tell the two apart — that needs a render.
  { token: 'neutral-100', max: 39, reason: '1.23:1 — dividers and card outlines.' },
  { token: 'neutral-200', max: 2, reason: '1.54:1 — a dropdown edge and a table rule.' },
  { token: 'neutral-800', max: 1, reason: '1.10:1 — the dark footer\'s top border.' },
  { token: 'neutral-300', max: 1, reason: '2.10:1 — a gallery thumbnail edge.' },

  // ── the accent ────────────────────────────────────────────────────────
  //
  // The brand accent (#0f8fa3) reaches 3.83:1 on white: fine for a large
  // label or a boundary, under the 4.5:1 body floor — and white ON it, which
  // is the primary button across the whole product, is the same 3.83:1.
  //
  // The accent is a brand value in brand.ts and its tone is the client's
  // decision (Law 1), so this checker records it rather than changing it.
  // Darkening to about #0b7385 clears the floor and keeps the hue.
  { token: 'white', max: 4, reason: '3.83:1 — white text on the accent button.' },
  { token: 'accent-hover/80', max: 2, reason: '3.97:1 — the storefront auth-page link tone.' },
  { token: 'neutral-400', max: 1, reason: '2.99:1 on neutral-50 — a gallery placeholder.' },
];

/* ── scanning ──────────────────────────────────────────────────────────── */

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

function sourceRoots() {
  const dirs = [];
  for (const top of ['apps', 'packages']) {
    let workspaces;
    try { workspaces = readdirSync(join(ROOT, top)); } catch { continue; }
    for (const w of workspaces) {
      const src = join(ROOT, top, w, 'src');
      if (existsSync(src) && statSync(src).isDirectory()) dirs.push(src);
    }
  }
  return dirs;
}

/** `text-neutral-900/60` → { kind, token, alpha }. Null when not a palette colour. */
function parseClass(cls, palette) {
  const m = cls.match(/^(text|bg|border|fill|stroke|ring|divide)-([a-z0-9-]+?)(?:\/(\d{1,3}))?$/);
  if (!m) return null;
  const [, kind, token, alpha] = m;
  if (!palette.has(token)) return null;
  return { kind, token, alpha: alpha === undefined ? 1 : Number(alpha) / 100 };
}

/** Every colour utility in a file, with the className it shared, if any. */
export function scanColours(source, palette) {
  const uses = [];
  const lines = source.split('\n');
  lines.forEach((line, i) => {
    // A className's worth of classes: quoted strings and template chunks.
    for (const chunk of line.match(/(['"`])[^'"`]*\1/g) ?? []) {
      const classes = chunk.slice(1, -1).split(/\s+/).map((c) => parseClass(c, palette)).filter(Boolean);
      if (!classes.length) continue;
      const bg = classes.find((c) => c.kind === 'bg');
      for (const c of classes) uses.push({ ...c, pairedBg: c.kind === 'bg' ? null : bg ?? null, line: i + 1 });
    }
  });
  return uses;
}

/* ── self-test ─────────────────────────────────────────────────────────── */

function selfTest() {
  // Published WCAG reference values.
  const cases = [
    ['#000000', '#ffffff', 21, 'black on white'],
    ['#ffffff', '#ffffff', 1, 'white on white'],
    ['#777777', '#ffffff', 4.48, '#777 on white — the classic near-miss'],
    ['#0000ff', '#ffffff', 8.59, 'blue on white'],
    ['#ff0000', '#ffffff', 4.0, 'red on white'],
  ];
  let failed = 0;
  for (const [fg, bg, expected, what] of cases) {
    const got = contrast(parseHex(fg), parseHex(bg));
    const ok = Math.abs(got - expected) < 0.02;
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}: ${got.toFixed(2)}:1 (expected ${expected})`);
  }
  // Compositing: 50% black over white is #808080-ish, ~3.95:1.
  const half = contrast(composite(parseHex('#000000'), parseHex('#ffffff'), 0.5), parseHex('#ffffff'));
  const ok = Math.abs(half - 3.95) < 0.05;
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  50% black composited over white: ${half.toFixed(2)}:1 (expected ~3.95)`);

  if (failed) {
    console.error(`\n${failed} self-test case(s) failed — the contrast maths is wrong, so every result it prints is wrong.\n`);
    process.exit(1);
  }
  console.log(`\nSelf-test OK (${cases.length + 1} cases) — ratios and alpha compositing match the published values.`);
}

/* ── main ──────────────────────────────────────────────────────────────── */

function main() {
  const brandPath = join(ROOT, BRAND_FILE);
  if (!existsSync(brandPath)) {
    console.error(`\nCannot find ${BRAND_FILE}. This check reads the palette from the brand\nfile; without it there is nothing to check, and printing OK would be a lie.\n`);
    process.exit(1);
  }

  if (process.argv.includes('--self-test')) return selfTest();

  let palette;
  try {
    palette = readPalette(readFileSync(brandPath, 'utf8'));
  } catch (error) {
    console.error(`\nCould not read the palette: ${error.message}\n\nThis check is only as good as the colours it reads from ${BRAND_FILE}.\nIt fails rather than passing vacuously.\n`);
    process.exit(1);
  }

  const uses = [];
  let scanned = 0;
  for (const dir of sourceRoots()) {
    for (const file of sourceFiles(dir)) {
      scanned += 1;
      const rel = relative(ROOT, file);
      for (const u of scanColours(readFileSync(file, 'utf8'), palette)) uses.push({ ...u, file: rel });
    }
  }

  // The surfaces this product actually paints: the body background plus every
  // `bg-*` token the code uses. A foreground lands on one of these or on
  // nothing.
  const painted = new Set(uses.filter((u) => u.kind === 'bg' && u.alpha === 1).map((u) => u.token));
  const bodyBg = (readFileSync(join(ROOT, 'apps/web/src/app/globals.css'), 'utf8').match(/body\s*\{[^}]*?\bbg-([a-z0-9-]+)/s) ?? [])[1];
  if (bodyBg && palette.has(bodyBg)) painted.add(bodyBg);
  if (!painted.size) painted.add('white');

  const failures = [];
  const counts = new Map();
  /** Below the floor on the body surface, but clears it somewhere painted. */
  const notable = new Map();
  const bodySurface = bodyBg && palette.has(bodyBg) ? bodyBg : 'white';

  for (const u of uses) {
    if (u.kind === 'bg') continue;
    const floor = u.kind === 'text' ? FLOOR.text : FLOOR.boundary;
    const name = u.alpha === 1 ? u.token : `${u.token}/${Math.round(u.alpha * 100)}`;

    // 1. A stated pair: both colours are known, so the answer is certain.
    //
    //    A translucent background is not a colour either — `bg-accent/10` is
    //    a wash over whatever is beneath it, and treating it as solid accent
    //    reports a failure that does not exist. Composite it over each
    //    painted surface first and take the best case, exactly as an opaque
    //    foreground is handled below.
    if (u.pairedBg) {
      const base = palette.get(u.pairedBg.token);
      const surfaces =
        u.pairedBg.alpha === 1
          ? [{ colour: base, via: u.pairedBg.token }]
          : [...painted].map((sfc) => ({
              colour: composite(base, palette.get(sfc), u.pairedBg.alpha),
              via: `${u.pairedBg.token}/${Math.round(u.pairedBg.alpha * 100)} over ${sfc}`,
            }));
      const best = surfaces.reduce(
        (acc, sfc) => {
          const ratio = contrast(composite(palette.get(u.token), sfc.colour, u.alpha), sfc.colour);
          return ratio > acc.ratio ? { ratio, via: sfc.via } : acc;
        },
        { ratio: 0, via: '' },
      );
      if (best.ratio < floor) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
        failures.push({ ...u, name, on: best.via, ratio: best.ratio, floor, stated: true });
      }
      continue;
    }

    // 2. No stated background: it lands on one of the painted surfaces. Only
    //    a token that misses on every one of them is certainly wrong.
    const best = [...painted].reduce((acc, surface) => {
      const bg = palette.get(surface);
      const ratio = contrast(composite(palette.get(u.token), bg, u.alpha), bg);
      return ratio > acc.ratio ? { ratio, surface } : acc;
    }, { ratio: 0, surface: '' });

    if (best.ratio < floor) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
      failures.push({ ...u, name, on: `any painted surface (best: ${best.surface})`, ratio: best.ratio, floor });
      continue;
    }

    // It clears the floor somewhere. But "somewhere" may be a surface this
    // token is never actually used on — an accent that only works on the
    // dark footer still fails on every page. That cannot be proven without
    // rendering, so it is reported rather than enforced: the body background
    // is where most text lands, and missing the floor there is worth knowing.
    const body = palette.get(bodySurface);
    const composited = composite(palette.get(u.token), body, u.alpha);
    const onBody = contrast(composited, body);

    // Only worth saying for a colour that could plausibly be meant for this
    // surface. A foreground lighter than the body background was written for
    // a dark surface — `text-white` is not a contrast bug on a white page,
    // it is a colour that never appears there. Reporting those buries the
    // two findings that matter under eight that do not.
    const belongsHere = luminance(composited) < luminance(body);
    if (belongsHere && onBody < floor) {
      const seen = notable.get(name) ?? { count: 0, ratio: onBody, floor, sample: [] };
      seen.count += 1;
      if (seen.sample.length < 3) seen.sample.push(`${u.file}:${u.line}`);
      notable.set(name, seen);
    }
  }

  // The ratchet: known debt may shrink, never grow; anything new fails.
  const allowed = new Map(BASELINE.map((b) => [b.token, b]));
  const newTokens = [...counts.keys()].filter((t) => !allowed.has(t));
  const grown = [...counts.entries()].filter(([t, n]) => allowed.has(t) && n > allowed.get(t).max);
  const shrunk = BASELINE.filter((b) => (counts.get(b.token) ?? 0) < b.max);

  if (!newTokens.length && !grown.length) {
    const debt = [...counts.values()].reduce((a, b) => a + b, 0);
    console.log(
      `Contrast OK (${scanned} files, ${palette.size} palette colours from ${BRAND_FILE}, ` +
      `${painted.size} painted surface(s); ${debt} known-below-floor use(s) within baseline)`,
    );
    for (const b of shrunk) {
      console.log(`  ↓ \`${b.token}\` is now ${counts.get(b.token) ?? 0} use(s), under its baseline of ${b.max} — lower the baseline in scripts/check-contrast.mjs.`);
    }
    if (notable.size) {
      const total = [...notable.values()].reduce((a, b) => a + b.count, 0);
      console.log(
        `  ⚠ ${notable.size} token(s), ${total} use(s), clear the floor on some painted surface but NOT on\n` +
        `    the body surface (\`${bodySurface}\`), which is where most text lands. Not enforced — proving it\n` +
        `    needs a render (docs/design/15-integrity.md, check 6). Worth a look:`,
      );
      for (const [token, v] of [...notable.entries()].sort((a, b) => b[1].count - a[1].count)) {
        console.log(`      \`${token}\`  ${v.ratio.toFixed(2)}:1 on ${bodySurface} (floor ${v.floor})  ×${v.count}  e.g. ${v.sample[0]}`);
      }
    }
    return;
  }

  console.error('\nCOL-3 violations — contrast below the WCAG 2.2 AA floor:\n');
  for (const token of newTokens) {
    const sample = failures.filter((f) => f.name === token).slice(0, 4);
    console.error(`  \`${token}\` — ${counts.get(token)} use(s), ${sample[0].ratio.toFixed(2)}:1 on ${sample[0].on}, floor ${sample[0].floor}:1`);
    for (const s of sample) console.error(`      ${s.file}:${s.line}`);
    if (counts.get(token) > sample.length) console.error(`      … and ${counts.get(token) - sample.length} more`);
    console.error('');
  }
  for (const [token, n] of grown) {
    console.error(`  \`${token}\` — ${n} use(s), up from a baseline of ${allowed.get(token).max}.\n      ${allowed.get(token).reason}\n      The debt may shrink; it may not grow.\n`);
  }
  console.error(
    `Text needs ${FLOOR.text}:1; large text and a meaningful boundary need ${FLOOR.boundary}:1\n` +
    `(docs/design/10-laws.md COL-3, docs/design/07-accessibility.md).\n\n` +
    `Use a tone that meets the floor, or — if this colour genuinely carries no\n` +
    `meaning a user must perceive — say so by adding it to BASELINE in this file,\n` +
    `with the reason. A baseline entry is debt that is written down, not a pass.\n`,
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

#!/usr/bin/env node
/**
 * Enforces COL-3 — text and meaningful boundaries meet their contrast floor.
 *
 * `docs/design/process-governance/15-integrity.md` ranks this first of the ten integrity checks,
 * for one reason: it is the only one that needs neither a browser nor a
 * running app. A contrast ratio is arithmetic over two colours, and both
 * colours are already in this repository. Everything else in that build order
 * has to render something; this just has to read.
 *
 * WCAG 2.2 AA, which docs/design/accessibility/07-accessibility.md sets as the floor:
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
 * Both themes are checked. A class names a role, not a colour, so it means
 * two colours (`themePalettes`): every use is evaluated against the light
 * palette and again against the dark one, each with its own baseline. A
 * region pinned with `data-theme="light"` or `"dark"` is judged only against
 * the theme it holds (`pinnedRegions`). What this catches that nothing else
 * does is the inverse-fill trap — a `bg-neutral-900` fill with `text-white`
 * reads 17.9:1 in light and 1.07:1 in dark, because the ramp flips and the
 * white label does not.
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

/** `onInverse` → `on-inverse`, the spelling Tailwind generates the class under. */
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * Every `token: '#rrggbb'` under a theme's colour block (`const colors` for
 * light, `const colorsDark` for dark), flattened to the names Tailwind
 * actually generates: `neutral-500`, `accent`, `accent-hover`, `white`,
 * `feedback-negative`, `on-inverse`, `accent-ink`.
 *
 * camelCase keys are kebab-cased on the way out. Before dark mode this check
 * lower-cased them instead, so `text-on-inverse` never matched anything and a
 * pair built on it was silently skipped.
 */
function readPalette(source, block = 'const colors = {') {
  const start = source.indexOf(block);
  if (start === -1) throw new Error(`no '${block}' block in ${BRAND_FILE}`);

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
      palette.set(kebab(token), parseHex(value));
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
  // ── decorative boundaries ─────────────────────────────────────────────
  //
  // WCAG 1.4.11 governs a boundary that CONVEYS information — the outline of
  // a control, a chart segment. A rule between two rows conveys nothing the
  // spacing beside it does not (PER-1, PER-5), so it is under no floor.
  //
  // This is the one baseline entry that needs judgement to apply: the same
  // token used to mark a control's edge IS a violation and is not covered
  // here. The checker cannot tell the two apart — that needs a render.
  { token: 'neutral-100', max: 42, reason: '1.23:1 — dividers and card outlines. 39 in components, plus 3 in the web stylesheet\'s house classes (lines 430, 446, 701), which the check could not read before it learned `@apply`: the scope grew, not the debt.' },
  { token: 'neutral-200', max: 7, reason: '1.54:1 to 1.72:1 — a dropdown edge (party-picker.tsx), and the CONTROL BOUNDARY of the house classes, newly readable through `@apply`: web `.field-input`, the base input/select/textarea/checkbox/radio rule, `.btn-secondary`, `.chip-unselected`, and the POS `.field-input` and `.tap-btn-secondary`. A control\'s boundary needs 3:1 (WCAG 1.4.11), so these six are a real accessibility debt, not a divider that conveys nothing. `.claude/rules/ui.md` says controls take `border-neutral-200`, so the two documents disagree; which one gives way is the owner\'s call (ADR-083, consistency addendum). A second use (a table rule, in an admin toast) was retired when six duplicated toast blocks were pulled into components/admin/toast-stack.tsx.' },
  { token: 'neutral-800', max: 1, reason: '1.10:1 — the dark footer\'s top border.' },
  { token: 'neutral-300', max: 1, reason: '2.10:1 — a gallery thumbnail edge.' },
  { token: 'neutral-400', max: 1, reason: '2.99:1 on neutral-50 — a gallery placeholder (paired bg-neutral-50 text-neutral-400).' },
];

/**
 * The same ratchet for the dark theme. Empty on purpose: dark mode was built
 * to the floors, so it starts with no debt, and anything this check finds in
 * dark is a real regression — usually an inverse pair written as
 * `bg-neutral-900 text-white`, which is dark-on-dark once the ramp flips.
 * Use `bg-inverse text-on-inverse` (brand.ts) for a fill that must flip.
 */
const DARK_BASELINE = [
  { token: 'neutral-100', max: 42, reason: '1.26:1 — the same dividers and card outlines as light (1.23:1), 39 in components and 3 in the stylesheet\'s house classes. Dark keeps the hairline at the same weight on purpose: it conveys nothing the spacing beside it does not.' },
];

// ── retired entries, kept as a record rather than deleted outright ───────
//
// Both were resolved in the same change: the accent was darkened (same hue,
// see brand.ts) and the secondary-text ramp's five failing alpha steps
// (/30 /35 /40 /45 /50) were consolidated onto /60, the nearest tone that
// already cleared the floor — the remedy this file itself had already
// worked out and left as a comment for whoever did the re-tone pass. That
// pass touched 231 call sites across 109 files, mechanically: no other
// change. `git log -p -- scripts/check-contrast.mjs` at the commit that
// removed them has the counts and the per-file breakdown.
//
//   neutral-900/50    148 uses, 3.54:1  →  now /60, 4.93:1
//   neutral-900/40     54 uses, 2.62:1  →  now /60
//   neutral-900/45     20 uses, 3.03:1  →  now /60
//   neutral-900/30      7 uses, 1.99:1  →  now /60
//   neutral-900/35      2 uses, 2.28:1  →  now /60
//   white                4 uses, 3.83:1  →  now 4.55:1 (accent darkened)
//   accent-hover/80      2 uses, 3.97:1  →  now 4.55:1 on neutral-50 (solved directly against it)
//
// Still open, and NOT touched by that pass — informational only today,
// because the checker cannot prove a failure without knowing the real
// ambient surface (see the "clears the floor on some painted surface but
// NOT on the body surface" report): `neutral-500` (88 uses, mostly POS) and
// `neutral-400` (26 uses, storefront) as bare text colours miss 4.5:1 on
// `neutral-50`. Neither is part of "the text ramp" — both are solid steps
// on the neutral SCALE (theme-colors.ts), a different part of the palette
// from the alpha-based ramp this pass addressed — so raising them is a
// separate decision, not made here.

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
      pushUses(uses, classes, i + 1);
    }
  });

  // `@apply bg-amber-50 text-amber-700;` in a stylesheet is a className with no quotes, which the loop above
  // cannot see, so every colour pair the house classes (`.btn`, `.notice`, `.card`, `.chip`) are made of went
  // unchecked while the pages built on them were. A statement can span lines, so it is read from the whole source.
  const apply = /@apply\s+([^;{}]+);/g;
  let match;
  while ((match = apply.exec(source))) {
    const line = source.slice(0, match.index).split('\n').length;
    pushUses(uses, match[1].split(/\s+/).map((c) => parseClass(c, palette)).filter(Boolean), line);
  }
  return uses;
}

/**
 * One className's colours, each remembering the background it was written beside. A border, ring or divider
 * in the very colour of the fill under it (`border-accent bg-accent`, a selected chip) draws no edge of its own:
 * the fill is the edge, so there is no boundary to measure and it is not a use.
 */
function pushUses(uses, classes, line) {
  if (!classes.length) return;
  const bg = classes.find((c) => c.kind === 'bg');
  for (const c of classes) {
    const edge = c.kind === 'border' || c.kind === 'ring' || c.kind === 'divide';
    if (edge && bg && bg.token === c.token && bg.alpha === c.alpha) continue;
    uses.push({ ...c, pairedBg: c.kind === 'bg' ? null : bg ?? null, line });
  }
}

/* ── pinned regions ────────────────────────────────────────────────────── */

/**
 * A region that holds one theme whatever the page is in: an element carrying
 * `data-theme="light"` (or `"dark"`). Its descendants resolve every token
 * against THAT palette, so checking them against the other theme reports
 * failures that cannot happen — a dark footer whose `text-neutral-300` is
 * written for a dark surface is correct, and the same class on the flipped
 * ramp is not the footer's problem.
 *
 * Returns the 1-based line range of each pinned element, found the way
 * prettier lays JSX out rather than by parsing it: the element starts at the
 * nearest line at or above the attribute that opens with `<tag`, and ends at
 * its own line when it closes there, else at the first later line back at the
 * same indentation that opens with `</` or `/>`. Cheap, and proven by the
 * self-test; a layout it cannot follow yields no region, which only means
 * the file is checked in both themes — the strict direction.
 */
export function pinnedRegions(source) {
  const lines = source.split('\n');
  const regions = [];
  lines.forEach((line, i) => {
    const attr = line.match(/\bdata-theme=(?:"(light|dark)"|'(light|dark)'|\{['"](light|dark)['"]\})/);
    if (!attr) return;
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // a comment mentioning the attribute
    const theme = attr[1] ?? attr[2] ?? attr[3];

    let start = i;
    while (start > 0 && !/^\s*<[A-Za-z]/.test(lines[start])) start -= 1;
    if (!/^\s*<[A-Za-z]/.test(lines[start])) return;
    const indent = lines[start].match(/^\s*/)[0].length;

    // Closes on the line it opens: `<span …>text</span>` or `<hr … />`.
    let end = -1;
    if (start === i && (/<\/[A-Za-z]/.test(lines[start]) || /\/>\s*$/.test(lines[start]))) end = start;
    // A multi-line opening tag that self-closes: `/>` back at the tag's own indent.
    for (let j = start + 1; end === -1 && j < lines.length; j += 1) {
      const t = lines[j];
      if (!t.trim()) continue;
      const here = t.match(/^\s*/)[0].length;
      if (here < indent) break;
      if (here === indent && /^\s*(<\/|\/>)/.test(t)) end = j;
    }
    if (end !== -1) regions.push({ theme, from: start + 1, to: end + 1 });
  });
  return regions;
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

  // The dark half: the trap the whole two-theme pass exists to catch, the
  // fill/ink split, the kebab-casing, and pinned regions.
  const check = (ok, what) => {
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  };
  check(kebab('onInverse') === 'on-inverse' && kebab('accentInk-hover') === 'accent-ink-hover', 'camelCase palette keys become the class spelling');

  const L = new Map(Object.entries({ white: '#ffffff', surface: '#ffffff', 'neutral-50': '#f2f2f2', 'neutral-900': '#121111', accent: '#0e8294', 'accent-hover': '#095865' }).map(([k, v]) => [k, parseHex(v)]));
  const D = new Map(Object.entries({ white: '#ffffff', surface: '#171516', 'neutral-50': '#0c0b0b', 'neutral-900': '#f9f7f8', accent: '#0e8294', 'accent-hover': '#095865', 'accent-ink': '#3db8cb', 'accent-ink-hover': '#8fdae6' }).map(([k, v]) => [k, parseHex(v)]));
  const palettes = themePalettes(L, D);
  check(palettes.dark.fill.get('white') === D.get('surface'), 'dark: `bg-white` is the surface, not paper');
  check(palettes.dark.fill.get('accent') === L.get('accent') && palettes.dark.ink.get('accent') === D.get('accent-ink'), 'dark: `bg-accent` keeps the brand fill, `text-accent` is the lighter ink');

  const trap = [
    { kind: 'bg', token: 'neutral-900', alpha: 1, pairedBg: null, line: 1, file: 'x' },
    { kind: 'text', token: 'white', alpha: 1, pairedBg: { kind: 'bg', token: 'neutral-900', alpha: 1 }, line: 1, file: 'x' },
  ];
  const inLight = analyse(trap, palettes.light, 'neutral-50', 'light');
  const inDark = analyse(trap, palettes.dark, 'neutral-50', 'dark');
  check(inLight.failures.length === 0, 'a neutral-900 fill with white text passes in light (17.9:1)');
  check(inDark.failures.length === 1, 'the same pair fails in dark (white on near-white) — the trap this pass exists for');
  const pinned = analyse([{ ...trap[1], pin: 'light' }, trap[0]], palettes.dark, 'neutral-50', 'dark');
  check(pinned.failures.length === 0 && pinned.pinnedElsewhere === 1, 'a use inside a region pinned to light is not judged against dark');

  const fixture = ['<div>', '  <footer', '    data-theme="light"', '    className="a"', '  >', '    <p className="b">x</p>', '  </footer>', '  <span data-theme="dark" className="c">y</span>', '  <p className="d">z</p>', '</div>'].join('\n');
  const regions = pinnedRegions(fixture);
  check(
    regions.length === 2 && regions[0].theme === 'light' && regions[0].from === 2 && regions[0].to === 7 && regions[1].theme === 'dark' && regions[1].from === 8 && regions[1].to === 8,
    'pinned regions are found for a multi-line element and a one-line element, and nothing else',
  );
  check(pinnedRegions('// data-theme="light" is documented here\n<p className="a">x</p>').length === 0, 'a comment that mentions the attribute pins nothing');

  if (failed) {
    console.error(`\n${failed} self-test case(s) failed — the contrast maths is wrong, so every result it prints is wrong.\n`);
    process.exit(1);
  }
  console.log(`\nSelf-test OK — ratios and alpha compositing match the published values, and the two-theme pass catches the inverse-fill trap.`);
}

/* ── main ──────────────────────────────────────────────────────────────── */

/**
 * The two palettes a theme paints with. They differ only in dark, and only for
 * the two tokens whose fill and ink are different colours:
 *
 *   - `bg-white` is the surface, not paper (`bg-white` → dark `surface`).
 *   - `bg-accent` is the brand fill in both themes (a white label has to keep
 *     reading on it); `text-accent`, `border-accent` and `ring-accent` are the
 *     brand INK, which lightens in dark so it keeps reading on the surface.
 *
 * This mirrors `createThemeTailwind` in packages/shared/src/theme-tailwind.ts,
 * which is what makes the same class mean two colours. If that split changes,
 * this function changes with it.
 */
function themePalettes(light, dark) {
  const fill = new Map(dark);
  fill.set('accent', light.get('accent'));
  fill.set('accent-hover', light.get('accent-hover'));
  fill.set('white', dark.get('surface'));
  const ink = new Map(dark);
  ink.set('accent', dark.get('accent-ink'));
  ink.set('accent-hover', dark.get('accent-ink-hover'));
  return { light: { fill: light, ink: light }, dark: { fill, ink } };
}

/**
 * The whole analysis for ONE theme. `uses` is theme-independent (a class is a
 * class); what a theme changes is the colour each token resolves to.
 */
function analyse(uses, { fill, ink }, bodyBg, theme) {
  // The surfaces this product actually paints: the body background plus every
  // `bg-*` token the code uses. A foreground lands on one of these or on
  // nothing.
  const painted = new Set(uses.filter((u) => u.kind === 'bg' && u.alpha === 1 && fill.has(u.token)).map((u) => u.token));
  if (bodyBg && fill.has(bodyBg)) painted.add(bodyBg);
  if (!painted.size) painted.add('white');

  const failures = [];
  const counts = new Map();
  /** Below the floor on the body surface, but clears it somewhere painted. */
  const notable = new Map();
  const bodySurface = bodyBg && fill.has(bodyBg) ? bodyBg : 'white';
  /** Uses inside a region pinned to the OTHER theme: not this pass's to judge. */
  let pinnedElsewhere = 0;

  for (const u of uses) {
    if (u.kind === 'bg') continue;
    if (!ink.has(u.token)) continue;
    if (u.pin && u.pin !== theme) {
      pinnedElsewhere += 1;
      continue;
    }
    const floor = u.kind === 'text' ? FLOOR.text : FLOOR.boundary;
    const name = u.alpha === 1 ? u.token : `${u.token}/${Math.round(u.alpha * 100)}`;
    const fg = ink.get(u.token);

    // 1. A stated pair: both colours are known, so the answer is certain.
    //
    //    A translucent background is not a colour either — `bg-accent/10` is
    //    a wash over whatever is beneath it, and treating it as solid accent
    //    reports a failure that does not exist. Composite it over each
    //    painted surface first and take the best case, exactly as an opaque
    //    foreground is handled below.
    if (u.pairedBg && fill.has(u.pairedBg.token)) {
      const base = fill.get(u.pairedBg.token);
      const surfaces =
        u.pairedBg.alpha === 1
          ? [{ colour: base, via: u.pairedBg.token }]
          : [...painted].map((sfc) => ({
              colour: composite(base, fill.get(sfc), u.pairedBg.alpha),
              via: `${u.pairedBg.token}/${Math.round(u.pairedBg.alpha * 100)} over ${sfc}`,
            }));
      const best = surfaces.reduce(
        (acc, sfc) => {
          const ratio = contrast(composite(fg, sfc.colour, u.alpha), sfc.colour);
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
      const bg = fill.get(surface);
      const ratio = contrast(composite(fg, bg, u.alpha), bg);
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
    const body = fill.get(bodySurface);
    const composited = composite(fg, body, u.alpha);
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
  return { failures, counts, notable, painted, bodySurface, pinnedElsewhere };
}

function main() {
  const brandPath = join(ROOT, BRAND_FILE);
  if (!existsSync(brandPath)) {
    console.error(`\nCannot find ${BRAND_FILE}. This check reads the palette from the brand\nfile; without it there is nothing to check, and printing OK would be a lie.\n`);
    process.exit(1);
  }

  if (process.argv.includes('--self-test')) return selfTest();

  let lightPalette;
  let darkPalette;
  try {
    const source = readFileSync(brandPath, 'utf8');
    lightPalette = readPalette(source);
    darkPalette = readPalette(source, 'const colorsDark = {');
    // A dark block that lost a role would make every pair built on it vanish
    // from the scan rather than fail. Say so instead.
    for (const role of ['surface', 'overlay', 'inverse', 'on-inverse', 'accent-ink', 'neutral-50', 'neutral-900', 'white']) {
      if (!darkPalette.has(role)) throw new Error(`the dark palette has no '${role}' — the dark half cannot be checked`);
    }
  } catch (error) {
    console.error(`\nCould not read the palette: ${error.message}\n\nThis check is only as good as the colours it reads from ${BRAND_FILE}.\nIt fails rather than passing vacuously.\n`);
    process.exit(1);
  }

  // A class is scanned against the union of both themes' names: a token that
  // only one theme defines is still a token the code can use.
  const names = new Map([...darkPalette, ...lightPalette]);
  const uses = [];
  let scanned = 0;
  for (const dir of sourceRoots()) {
    for (const file of sourceFiles(dir)) {
      scanned += 1;
      const rel = relative(ROOT, file);
      const text = readFileSync(file, 'utf8');
      const regions = pinnedRegions(text);
      for (const u of scanColours(text, names)) {
        const pin = regions.find((r) => u.line >= r.from && u.line <= r.to)?.theme ?? null;
        uses.push({ ...u, file: rel, pin });
      }
    }
  }

  const bodyBg = (readFileSync(join(ROOT, 'apps/web/src/app/globals.css'), 'utf8').match(/body\s*\{[^}]*?\bbg-([a-z0-9-]+)/s) ?? [])[1];
  const palettes = themePalettes(lightPalette, darkPalette);
  const baselines = { light: BASELINE, dark: DARK_BASELINE };

  const problems = [];
  const summary = [];
  for (const theme of ['light', 'dark']) {
    const { failures, counts, notable, painted, bodySurface, pinnedElsewhere } = analyse(uses, palettes[theme], bodyBg, theme);
    const baseline = baselines[theme];
    const allowed = new Map(baseline.map((b) => [b.token, b]));
    problems.push({
      theme,
      failures,
      counts,
      allowed,
      newTokens: [...counts.keys()].filter((t) => !allowed.has(t)),
      grown: [...counts.entries()].filter(([t, n]) => allowed.has(t) && n > allowed.get(t).max),
    });
    summary.push({
      theme,
      painted,
      bodySurface,
      notable,
      pinnedElsewhere,
      debt: [...counts.values()].reduce((a, b) => a + b, 0),
      shrunk: baseline.filter((b) => (counts.get(b.token) ?? 0) < b.max).map((b) => ({ b, now: counts.get(b.token) ?? 0 })),
    });
  }

  // `--explain=<token>` lists every below-floor use of one token, in each theme:
  // the answer to "which forty?" when a baseline count moves.
  const explain = process.argv.find((a) => a.startsWith('--explain='))?.slice('--explain='.length);
  if (explain) {
    for (const { theme, failures } of problems) {
      const hits = failures.filter((f) => f.name === explain);
      console.log(`[${theme}] ${hits.length} use(s) of \`${explain}\` below its floor`);
      for (const f of hits) console.log(`  ${f.file}:${f.line}  ${f.ratio.toFixed(2)}:1 on ${f.on}`);
    }
    return;
  }

  if (problems.every((p) => !p.newTokens.length && !p.grown.length)) {
    console.log(
      `Contrast OK in both themes (${scanned} files, ${lightPalette.size} light + ${darkPalette.size} dark palette colours ` +
      `from ${BRAND_FILE}; ${summary.map((t) => `${t.theme}: ${t.painted.size} painted surface(s), ${t.debt} known-below-floor use(s) within baseline, ${t.pinnedElsewhere} use(s) skipped as pinned to the other theme`).join('; ')})`,
    );
    for (const t of summary) {
      for (const { b, now } of t.shrunk) {
        console.log(`  ↓ [${t.theme}] \`${b.token}\` is now ${now} use(s), under its baseline of ${b.max} — lower the baseline in scripts/check-contrast.mjs.`);
      }
      if (t.notable.size) {
        const total = [...t.notable.values()].reduce((a, b) => a + b.count, 0);
        console.log(
          `  ⚠ [${t.theme}] ${t.notable.size} token(s), ${total} use(s), clear the floor on some painted surface but NOT on\n` +
          `    the body surface (\`${t.bodySurface}\`), which is where most text lands. Not enforced — proving it\n` +
          `    needs a render (docs/design/process-governance/15-integrity.md, check 6). Worth a look:`,
        );
        for (const [token, v] of [...t.notable.entries()].sort((a, b) => b[1].count - a[1].count)) {
          console.log(`      \`${token}\`  ${v.ratio.toFixed(2)}:1 on ${t.bodySurface} (floor ${v.floor})  ×${v.count}  e.g. ${v.sample[0]}`);
        }
      }
    }
    return;
  }

  console.error('\nCOL-3 violations — contrast below the WCAG 2.2 AA floor:\n');
  for (const { theme, failures, counts, allowed, newTokens, grown } of problems) {
    for (const token of newTokens) {
      const sample = failures.filter((f) => f.name === token).slice(0, 4);
      console.error(`  [${theme}] \`${token}\` — ${counts.get(token)} use(s), ${sample[0].ratio.toFixed(2)}:1 on ${sample[0].on}, floor ${sample[0].floor}:1`);
      for (const s of sample) console.error(`      ${s.file}:${s.line}`);
      if (counts.get(token) > sample.length) console.error(`      … and ${counts.get(token) - sample.length} more`);
      console.error('');
    }
    for (const [token, n] of grown) {
      console.error(`  [${theme}] \`${token}\` — ${n} use(s), up from a baseline of ${allowed.get(token).max}.\n      ${allowed.get(token).reason}\n      The debt may shrink; it may not grow.\n`);
    }
  }
  console.error(
    `Text needs ${FLOOR.text}:1; large text and a meaningful boundary need ${FLOOR.boundary}:1\n` +
    `(docs/design/principles-laws/10-laws.md COL-3, docs/design/accessibility/07-accessibility.md).\n\n` +
    `Use a tone that meets the floor, or — if this colour genuinely carries no\n` +
    `meaning a user must perceive — say so by adding it to BASELINE (light) or DARK_BASELINE\n` +
    `(dark) in this file, with the reason. A baseline entry is debt that is written down, not a pass.\n`,
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

#!/usr/bin/env node
/**
 * Kills the "machine-made" look: the generic tells of an interface nobody
 * designed (gradient blobs, frosted glass, bouncing things, heavy shadows,
 * `transition-all`, emoji standing in for icons, marketing filler, a toast that
 * says "Success!" and nothing else).
 *
 * The `/restyle` skill tells an agent how to fix a screen; this is what makes
 * the fix stick. Each tell below is ONE entry in `TELLS`: its pattern, why it is a
 * tell, and what the house does instead. A tell that GROWS fails the build and the
 * message carries file:line and the remedy.
 *
 * A ratchet, not a wish (same mechanism as check-menus / check-danger):
 * BASELINE is the debt, per tell and per file, that existed when this was written
 * and is legitimate or waits for a designer. A count may shrink and may not grow.
 * A run below the baseline passes and says so, so the baseline is lowered in the
 * same change and cannot quietly regrow to where it was.
 *
 * What it scans: `*.tsx` and `*.css` in apps/web/src and apps/pos/src for the
 * styling tells; `*.tsx` in apps/mobile (app and src) plus apps/web/messages/*.json
 * for the copy tells (emoji, buzzword). Spec files, node_modules, .next excluded.
 * Comments are blanked before matching, so prose that names a tell is not a hit.
 *
 * What it does NOT check, stated so a green run is not read as more than it is:
 *   - `round-button` reads the attributes of a button, link or `…Button` tag and `.btn…` rules in CSS. It
 *     misses a class assembled from parts, a class held in a constant and passed in, a JSX element passed as a
 *     prop ahead of the class (`icon={<X />}`), and every React Native style (`theme.radius.pill` on a chip is
 *     kept out of this check and was fixed by hand).
 *   - `soft-radius` (`rounded-xl|2xl|3xl`) is deliberately not a tell: tailwind.config.ts
 *     maps `lg`, `xl`, `2xl` and `3xl` onto the one `--radius-lg` token and `sm`, `md`
 *     and the default onto `--radius`, so those classes are token spellings, not a
 *     second softer shape. Flagging them would be noise.
 *   - Gradients written as `repeating-linear-gradient` (a progress mask) are not
 *     surfaces and are not matched.
 *   - A class built from parts (`'shadow-' + size`), a tell inside a string that is
 *     assembled at run time, and any tell in a file type not listed above.
 *   - Whether a legitimate remainder is still legitimate: that is review.
 *   - Copy that lives behind a translation key is only read where it is written in
 *     messages/*.json (emoji, buzzword); `vague-success` reads the literal at the
 *     call site, and a title or message that is an expression is counted, not failed.
 *   - Everything that needs a render: how a screen actually looks, density, rhythm.
 *
 *   node scripts/check-tells.mjs             # scan the apps
 *   node scripts/check-tells.mjs <file...>   # the tells in these files, with lines (what /restyle reads; never fails)
 *   node scripts/check-tells.mjs --self-test # prove the matcher still works
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const ROOT = resolve('.');
const SKIP_DIRS = new Set(['node_modules', '.next', '.expo', 'dist', 'build', 'generated', 'coverage', '.turbo']);

/** Where each kind of file is read. `style` tells apply only where Tailwind and the global stylesheet live. */
const SOURCES = [
  { dir: 'apps/web/src', exts: ['.tsx', '.css'], style: true },
  { dir: 'apps/pos/src', exts: ['.tsx', '.css'], style: true },
  { dir: 'apps/mobile/app', exts: ['.tsx'], style: false },
  { dir: 'apps/mobile/src', exts: ['.tsx'], style: false },
  { dir: 'apps/web/messages', exts: ['.json'], style: false },
];

/** Country flags are the one pictograph that is data, not decoration: a country or locale picker shows them. */
export const FLAG_FILE = /(?:country|locale|language|dial-?code)[\w-]*(?:picker|select|switcher)\.tsx$/i;

/** One vague success word, as a whole literal: "Success", "Saved!", "Operation successful", "All set"… */
const VAGUE = String.raw`(?:success|done|saved|operation successful(?:ly)?|all set|awesome|great)[.!]*`;

/**
 * The tells. `scope: 'style'` is read in the web and POS styling files, `scope: 'copy'` in every
 * file listed in SOURCES that holds text. `hit` and `miss` are the self-test: what the pattern
 * must catch and what it must leave alone.
 */
export const TELLS = [
  {
    id: 'gradient-surface',
    scope: 'style',
    exts: ['.tsx', '.css'],
    pattern:
      /(?<![\w-])bg-gradient-to-|(?<![\w-])(?:from|via|to)-[a-z[][\w/.[\]%-]*|(?<![\w-])(?:linear|radial|conic)-gradient\(/g,
    why: 'a gradient hero, card or blob is the first thing a generator reaches for to make a surface look designed',
    instead: 'a flat token surface (`bg-surface`, `bg-neutral-50`, `bg-overlay`); `.card-lit` where a card needs lift',
    hit: [
      'className="bg-gradient-to-br from-accent/40 to-neutral-200"',
      'md:after:from-scrim/5 after:to-transparent',
      'background: linear-gradient(red, blue)',
      'a { background: radial-gradient(#000, #fff) }',
    ],
    miss: [
      'ready-to-wear',
      'id={`${id}-to-hint`}',
      'mask-image: repeating-linear-gradient(to right, #000 0 1px)',
      'type-to-confirm',
      'Gaz-to-metres',
    ],
  },
  {
    id: 'glass',
    scope: 'style',
    exts: ['.tsx', '.css'],
    pattern: /(?<!\w)backdrop-blur(?!-none)(?![\w])|(?<!\w)backdrop-filter(?!\s*:\s*none)/g,
    why: 'frosted glass is the other generic "premium" surface, and it costs a repaint of everything behind it',
    instead: 'an opaque surface token (`bg-overlay`, `bg-surface`); a scrim is `bg-scrim/40` alone',
    hit: [
      'fixed inset-0 bg-scrim/40 backdrop-blur-sm',
      'backdrop-blur-md',
      'backdrop-filter: blur(8px);',
      '-webkit-backdrop-filter: blur(4px)',
    ],
    miss: ['backdrop-blur-none', 'backdrop-filter: none;', 'backdrop-opacity-50'],
  },
  {
    id: 'loud-motion',
    scope: 'style',
    exts: ['.tsx', '.css'],
    pattern: /(?<![\w-])animate-(?:bounce|ping|pulse)(?![\w-])/g,
    why: 'a bouncing, pinging or pulsing element asks for attention nothing here has earned',
    instead:
      '`.skeleton` for a loading placeholder, `.pop` and the motion tokens for a result; `animate-spin` on a loader is fine',
    hit: ['className="animate-bounce"', 'motion-safe:animate-ping', 'h-8 w-8 animate-pulse rounded-full'],
    miss: ['animate-spin', 'animate-spinner', 'animate-fadeIn', 'animate-pulsar'],
  },
  {
    id: 'heavy-shadow',
    scope: 'style',
    exts: ['.tsx', '.css'],
    pattern: /(?<![\w-])(?:[\w-]+:)*shadow-(?:lg|xl|2xl)(?![\w-])/g,
    why: 'a big soft drop shadow is the generic card; the house has no shadow at rest',
    instead:
      'no shadow at rest, `.lift` brings one on hover; a true overlay names its tier (`shadow-overlay`, `shadow-modal`)',
    hit: [
      'rounded bg-overlay shadow-xl',
      'hover:shadow-lg',
      'btn-primary shadow-2xl',
      '@apply border-neutral-200 shadow-lg;',
    ],
    miss: ['shadow-overlay', 'shadow-modal', 'shadow-md', 'drop-shadow-lg', 'shadow-[1px_0_0_0_rgba(0,0,0,0.1)]'],
  },
  {
    id: 'round-button',
    scope: 'style',
    exts: ['.tsx', '.css'],
    // `rounded-full` (or an arbitrary 999px / 50%) in the attributes of a `<button>`, `<a>`, `<Link>`,
    // `<summary>` or a `…Button` component, and the same radius in a `.btn…` / `.…-button` rule. The
    // lookbehind comes last so the cheap literal is tried first; it walks back to the tag's `<`, and
    // `[^<>]` stops it at the previous tag, so a `rounded-full` dot INSIDE a button is not a hit. An arrow
    // (`=>`) and a comparison (`<=`, `>=`, ` < `, ` > `) inside an attribute do not stop it either, or a
    // button with `disabled={quantity <= 1}` would slip through. A JSX element passed as a prop before the
    // class (`icon={<X />}`) still stops it: that is a miss, named in the header.
    pattern:
      /(?<![\w-])(?:[\w-]+:)*rounded-(?:full|\[(?:9{3,}px|50%)\])(?![\w-])(?<=<(?:button|a|summary|Link|NextLink|(?:[A-Z]\w*)?Button)\b(?:[^<>]|=>|[<>]=|(?<=\s)[<>](?=\s))*?)|(?:rounded-full|border-radius:\s*(?:9{3,}px|50%))(?<=\.[\w-]*(?:btn|button)[^{}]*\{[^{}]*?)/g,
    why: 'a circular or pill button is a second button shape: the house button has one corner, and a pill is a status (PER-3)',
    instead:
      'the house corner: `rounded` (it resolves to `--radius`), or `.btn`, `.btn-ghost`, `.icon-btn`; circles stay for avatars, dots, spinners and count badges',
    hit: [
      '<button type="button" className="h-9 w-9 rounded-full">',
      "<Link\n href={href}\n className={cn('flex h-12 w-12 rounded-full', active)}\n>",
      '<button onClick={() => go()} className="h-8 w-8 lg:rounded-full">',
      '<IconButton className="rounded-full" />',
      '<Button variant="secondary" className="h-9 w-9 rounded-full">',
      '<a href="/x" className="rounded-[999px] px-3">',
      '<button disabled={quantity <= 1} className="h-9 w-9 rounded-full">',
      '<button disabled={n >= max} onClick={() => go(n > 1)} className="rounded-full">',
      '.btn-round {\n  @apply h-9 rounded-full;\n}',
      '.btn { border-radius: 9999px; }',
    ],
    miss: [
      '<span className="h-5 w-5 rounded-full bg-accent" />',
      '<img className="h-8 w-8 rounded-full" alt="" />',
      '<button className="h-9 w-9 rounded"><span className="h-1 w-1 rounded-full" /></button>',
      '<abbr className="rounded-full">',
      '<button className="rounded">a</button>\n<div className="rounded-full">',
      '<a href="/x" className="px-3">\n  {n > 1 ? <i className="rounded-full" /> : null}\n</a>',
      '<button className="rounded">',
      '.badge { @apply rounded-full; }',
      '.spinner { @apply h-4 w-4 rounded-full; }',
    ],
  },
  {
    id: 'transition-all',
    scope: 'style',
    exts: ['.tsx', '.css'],
    pattern: /(?<![\w-])transition-all(?![\w-])/g,
    why: 'it animates every property, including layout ones, and shows nobody decided what moves',
    instead:
      'name the property: `transition-colors`, `transition-transform`, `transition-opacity`, or a token class from ui.md (never a layout property: see `layout-motion`)',
    hit: ['transition-all duration-normal', 'hover:bg-x transition-all'],
    miss: ['transition-colors', 'transition-[opacity,visibility]', 'transition-transform duration-normal'],
  },
  {
    id: 'layout-motion',
    scope: 'style',
    exts: ['.tsx', '.css'],
    // A Tailwind arbitrary `transition-[…]` that names a property which changes the box (width, height, max-height,
    // margin, padding, an edge, a grid track), or a CSS `transition` / `transition-property` declaration that does.
    // `transition-[opacity,visibility]` and `transition-[background-color,color,transform]` are the house forms.
    pattern:
      /(?<![\w-])(?:[\w-]+:)*transition-\[[^\]]*\b(?:width|height|margin|padding|top|left|right|bottom|inset|grid-template-rows|grid-template-columns|flex-basis)\b[^\]]*\]|(?<![\w-])transition(?:-property)?\s*:[^;{}]*\b(?:width|height|margin|padding|top|left|right|bottom|inset|grid-template-rows|grid-template-columns|flex-basis)\b/g,
    why: 'animating a property that changes the box re-lays out the page on every frame, and MOT-5 allows transform and opacity only',
    instead:
      'a transform: grow a line with `scale-x-0` to `scale-x-100` and a logical origin, slide with `translate`, and open a region with `Disclosure` (one `rise` on its content, height not animated)',
    hit: [
      'transition-[width] duration-normal',
      'transition-[max-height,opacity] duration-slow',
      'md:transition-[height]',
      'transition: width 200ms ease;',
      'transition-property: margin-left, opacity;',
    ],
    miss: [
      'transition-[opacity,visibility]',
      'transition-[background-color,color,transform]',
      'transition-transform duration-normal',
      'transition: opacity 200ms ease, transform 200ms ease;',
      'transition-[line-clamp]',
    ],
  },
  {
    id: 'emoji-glyph',
    scope: 'copy',
    exts: ['.tsx', '.json'],
    // Extended_Pictographic includes the arrows, (c), (r), TM and a few text symbols; those are punctuation here, not icons.
    pattern: /(?![©®™ℹ‼⁉←-⇿])[\p{Extended_Pictographic}\p{Regional_Indicator}]/gu,
    allow: (match, file) => /\p{Regional_Indicator}/u.test(match) && FLAG_FILE.test(file),
    why: 'an emoji used as an icon or a bullet renders differently on every platform and is what a generator writes when it has no icon set',
    instead:
      'an icon from the icon set, or a word; state is a word as well as a colour (the glyph can go, the word stays)',
    hit: ['<span>⚠ Overdue</span>', 'label: "🛒 Cart"', '"title": "✨ New"', '<TabIcon glyph="👤" />'],
    miss: ['© 2026 Company', 'Brand™', 'Next →', '↑ up', 'plain text'],
  },
  {
    id: 'buzzword',
    scope: 'copy',
    exts: ['.tsx', '.json'],
    pattern:
      /elevate your|seamless(?:ly)?|unlock the power|supercharge|revolutioni[sz]e|cutting-edge|game-chang|in today['’]s fast-paced|\bdelve\b/gi,
    why: 'marketing filler says nothing about this product and is the voice of every generated landing page',
    instead: 'say the plain thing the product does, to whom, in the words the person would use',
    hit: [
      'Elevate your wardrobe',
      'a seamless checkout',
      'Unlock the power of tailoring',
      'game-changing',
      "In today's fast-paced world",
      'Let us delve in',
    ],
    // "next-gen formats" is Lighthouse's own term in a settings hint, ordinary English here, so it is not on the list.
    miss: ['Lighthouse stops flagging next-gen formats', 'a smooth checkout', 'delivered on time', 'a sturdy bridge'],
  },
  {
    id: 'vague-success',
    scope: 'copy',
    exts: ['.tsx'],
    // Three places a literal success message is written: a toast, a `notice-success` body, a `SuccessState` title.
    pattern: new RegExp(
      String.raw`\b(?:addToast|pushToast|showToast|toast)\(\s*(['"` +
        '`' +
        String.raw`])${VAGUE}\1|notice-success[^<>]*>\s*${VAGUE}\s*<|<SuccessState\b(?:(?!<)[\s\S]){0,400}?\btitle=(?:"${VAGUE}"|\{\s*['"` +
        '`' +
        String.raw`]${VAGUE}['"` +
        '`' +
        String.raw`]\s*\})`,
      'gi',
    ),
    // The same three places written as an expression: counted, never failed.
    dynamic:
      /\b(?:addToast|pushToast|showToast|toast)\(\s*(?!['"`])[^;]*?,\s*['"]success['"]|notice-success[^<>]*>\s*\{|<SuccessState\b(?:(?!<)[\s\S]){0,400}?\btitle=\{\s*(?!['"`])/gi,
    why: 'a success that names nothing ("Success!", "Done") does not say what happened to which thing (SUC-1)',
    instead:
      'name the act and its object: "Discount saved", "Recipe created", "3 products archived" (docs/design/components-states/04-states.md, SUC-1)',
    hit: [
      "addToast('Success', 'success')",
      'addToast("Saved!")',
      '<p className="notice notice-success">Done</p>',
      '<SuccessState title="All set" />',
      '<SuccessState icon={x}\n title={"Operation successful"} />',
    ],
    miss: [
      "addToast('Discount saved.', 'success')",
      '<p className="notice notice-success">Payment received.</p>',
      '<SuccessState title="Order placed" />',
      "addToast('Saved 3 rows')",
      "addToast(msg, 'success')",
    ],
  },
];

/**
 * The debt on the day this was written, per tell and per file: a count of LINES carrying the tell.
 * Lower a number (or delete the entry) in the same change that removes the last of its kind; never raise one.
 * Every entry says why it stays and names the file; "designer" means removing it changes how a screen looks
 * in a way that needs a person's eye, so it is held here rather than guessed at.
 */
export const BASELINE = {
  'gradient-surface': {
    // House primitives, not decorative surfaces: `.card-lit` (a 6rem fade from one surface token to the next),
    // `--frame-ink` (a solid colour used as a background-image layer so two layers can be stacked), `.skeleton`
    // (the loading sweep) and `.sheen` (the one-shot highlight after a value changes). All token colours.
    'apps/web/src/app/globals.css': 4,
    // The sticky first column's right-hand edge: a 12px `from-scrim/5 to-transparent` fade that tells the reader
    // the table scrolls under it (one line for ltr, one for rtl). A scrim over scrolling content, not a surface.
    'apps/web/src/components/ui/data-table.tsx': 2,
    // The storefront loading skeleton's hero band: `from-neutral-50 to-neutral-50` is flat in effect (both stops
    // are the same colour). Writing it as `bg-neutral-50` is the fix, but it pairs the band's `border-neutral-100`
    // with a background and moves check-contrast's neutral-100 baseline from 39 to 40; held here until that debt
    // is paid, then replace this line and delete this entry.
    'apps/web/src/app/(storefront)/[locale]/loading.tsx': 1,
    // The design-system specimen for "Frosted overlay": the gradient stands in for a photograph the overlay
    // sits on, to show the pattern the docs describe. It is a picture stand-in, not a surface.
    'apps/web/src/components/design-system/patterns.tsx': 1,
  },
  glass: {
    // Modal and drawer scrims blur the page behind (`bg-scrim/40 backdrop-blur-sm`): dialog.tsx, admin-shell.tsx
    // (mobile drawer), storefront mobile-nav.tsx, filter-panel.tsx, size-chart-modal.tsx. Dropping the blur
    // leaves a flat scrim and changes how every overlay feels: designer.
    'apps/web/src/components/ui/dialog.tsx': 1,
    'apps/web/src/components/admin/admin-shell.tsx': 1,
    'apps/web/src/components/storefront/mobile-nav.tsx': 1,
    'apps/web/src/components/storefront/filter-panel.tsx': 1,
    'apps/web/src/components/storefront/size-chart-modal.tsx': 1,
    // A round control laid over a product photograph (`bg-white/90 backdrop-blur-sm`) so it reads on any image:
    // the quick-view button here and `.icon-btn` in globals.css. A surface over a picture, not decoration.
    'apps/web/src/components/storefront/product-card.tsx': 1,
    'apps/web/src/app/globals.css': 1,
    // `FROSTED`, the design system's documented "text over a picture sits on a surface" pattern (solid when the
    // OS asks for less transparency); the specimen has to show it.
    'apps/web/src/components/design-system/patterns.tsx': 1,
  },
  'loud-motion': {
    // The "Live" dot in the Frosted overlay specimen: `motion-safe:animate-ping`. A specimen of the pattern;
    // the ping is the one a designer should decide on (a steady dot says the same thing).
    'apps/web/src/components/design-system/patterns.tsx': 1,
  },
  'heavy-shadow': {
    // The storefront's sticky add-to-cart button carries `shadow-lg` at rest so it separates from the content
    // scrolling under it. Removing it changes how the bar looks: designer.
    'apps/web/src/components/storefront/product-purchase.tsx': 1,
  },
  'round-button': {
    // `role="switch"`: the pill track and round thumb are what makes a switch read as a switch, and it is an
    // input that holds a state, not an action button. Kept as the one circle-shaped control; a designer may
    // rule it into the house corner, which would delete this entry.
    'apps/web/src/components/ui/switch.tsx': 1,
  },
  'layout-motion': {
    // The stitching panel's "Get stitched" region opens by animating `max-height` from 0 to 4000px. Replacing it
    // means rebuilding the region on `Disclosure`, and the collapsed content is still reachable by Tab today, which
    // is a separate defect to fix in the same change. Held here, not guessed at.
    'apps/web/src/components/storefront/stitching-panel.tsx': 1,
  },
  'transition-all': {},
  'emoji-glyph': {
    // The mobile tab bar uses four emoji as its icons (thread, bag, scissors, person). A real fix needs an icon
    // set chosen for the app, which is a design decision, not a swap: designer.
    'apps/mobile/app/(tabs)/_layout.tsx': 4,
  },
  buzzword: {},
  'vague-success': {},
};

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** Blank comments to spaces, keeping every newline, so line numbers still point at the source. */
export function blankComments(source) {
  const blank = (text) => text.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[\s;{(,])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

/** The line numbers (one per line, however many times it matches) where `tell` fires in `source`. */
export function findTell(tell, source, file = 'file.tsx') {
  const text = file.endsWith('.json') ? source : blankComments(source);
  const lines = new Set();
  for (const m of text.matchAll(tell.pattern)) {
    if (tell.allow?.(m[0], file)) continue;
    lines.add(lineOf(text, m.index));
  }
  return [...lines].sort((a, b) => a - b);
}

/** How many times `tell.dynamic` (the unreadable twin of a literal) fires; counted, never failed. */
export function countDynamic(tell, source, file = 'file.tsx') {
  if (!tell.dynamic) return 0;
  return [...blankComments(source).matchAll(tell.dynamic)].length;
}

/** A tell is over when a file has more hit lines than its baseline allows (an absent entry allows none). */
export function compare(tell, perFile, baseline = BASELINE) {
  const allowed = baseline[tell.id] ?? {};
  const over = [];
  const under = [];
  for (const [file, lines] of Object.entries(perFile)) {
    const cap = allowed[file] ?? 0;
    if (lines.length > cap) over.push({ file, lines, cap });
    else if (lines.length < cap) under.push({ file, count: lines.length, cap });
  }
  for (const [file, cap] of Object.entries(allowed)) {
    if (!perFile[file] && cap > 0) under.push({ file, count: 0, cap });
  }
  return { over, under };
}

/**
 * Every tell in ONE file, with its lines: what `/restyle` reads before it edits, because the
 * whole-repo run prints only totals. Applies the same exts and scope rules as `scan`.
 */
export function tellsInFile(rel, text) {
  const source = SOURCES.find((s) => rel.startsWith(`${s.dir}/`));
  const ext = ['.tsx', '.css', '.json'].find((e) => rel.endsWith(e));
  if (!source || !ext) return [];
  return TELLS.filter((t) => t.exts.includes(ext) && !(t.scope === 'style' && !source.style))
    .map((tell) => ({ tell, lines: findTell(tell, text, rel), dynamic: countDynamic(tell, text, rel) }))
    .filter((r) => r.lines.length > 0 || r.dynamic > 0);
}

function* walk(dir, exts) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // an app that is not in this checkout
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path, exts);
    else if (exts.some((ext) => name.endsWith(ext)) && !/\.(spec|test)\.[tj]sx?$/.test(name)) yield path;
  }
}

function scan() {
  const hits = Object.fromEntries(TELLS.map((t) => [t.id, {}]));
  const dynamic = Object.fromEntries(TELLS.map((t) => [t.id, 0]));
  let files = 0;
  for (const source of SOURCES) {
    for (const path of walk(join(ROOT, source.dir), source.exts)) {
      files += 1;
      const text = readFileSync(path, 'utf8');
      const rel = relative(ROOT, path).split(sep).join('/');
      const ext = source.exts.find((e) => path.endsWith(e));
      for (const tell of TELLS) {
        if (!tell.exts.includes(ext)) continue;
        if (tell.scope === 'style' && !source.style) continue;
        const lines = findTell(tell, text, rel);
        if (lines.length) hits[tell.id][rel] = lines;
        dynamic[tell.id] += countDynamic(tell, text, rel);
      }
    }
  }
  return { hits, dynamic, files };
}

function selfTest() {
  const cases = [];
  const check = (what, ok) => cases.push([what, ok]);

  const ids = TELLS.map((t) => t.id);
  check('every tell has a unique id', new Set(ids).size === ids.length);
  check(
    'every tell states why and what to do instead',
    TELLS.every((t) => t.why && t.instead && t.pattern.global && t.hit.length && t.miss.length),
  );
  check(
    'the baseline names no tell that does not exist',
    Object.keys(BASELINE).every((id) => ids.includes(id)),
  );
  check(
    'every tell has a baseline entry, even an empty one',
    ids.every((id) => BASELINE[id]),
  );

  for (const tell of TELLS) {
    const file = tell.exts[0] === '.json' ? 'x.json' : 'x.tsx';
    tell.hit.forEach((snippet, i) =>
      check(`${tell.id} catches sample ${i + 1}`, findTell(tell, snippet, file).length === 1),
    );
    tell.miss.forEach((snippet, i) =>
      check(`${tell.id} leaves sample ${i + 1} alone`, findTell(tell, snippet, file).length === 0),
    );
  }

  const byId = Object.fromEntries(TELLS.map((t) => [t.id, t]));
  check(
    'animate-spin on a loader is not flagged',
    findTell(byId['loud-motion'], '<Spinner className="animate-spin" />').length === 0,
  );
  check(
    'a whole-line // comment is not a hit',
    findTell(byId['transition-all'], '// transition-all is banned\n<div />').length === 0,
  );
  check(
    'a whole-line block comment is not a hit',
    findTell(byId['glass'], '/*\n * backdrop-blur-sm\n */\n<div />').length === 0,
  );
  check('a JSX comment is not a hit', findTell(byId['heavy-shadow'], '{/* shadow-xl */}\n<div />').length === 0);
  check(
    'a comment in css is not a hit',
    findTell(byId['gradient-surface'], '/* linear-gradient(a, b) */\n.a{}', 'a.css').length === 0,
  );
  check(
    'a tell mixed in with code after a comment line is still a hit',
    findTell(byId['transition-all'], '// ok\n<div className="transition-all" />')[0] === 2,
  );
  check(
    'one line counts once however many times it matches',
    findTell(byId['gradient-surface'], 'bg-gradient-to-r from-a-100 via-b-100 to-c-100').length === 1,
  );
  check(
    'line numbers survive a blanked comment',
    findTell(byId['transition-all'], '/*\n\n*/\n<div className="transition-all" />')[0] === 4,
  );

  const flag = '<span>🇵🇰 Pakistan</span>';
  check(
    'a flag in a country picker is allowed',
    findTell(byId['emoji-glyph'], flag, 'apps/web/src/components/country-picker.tsx').length === 0,
  );
  check(
    'a flag in a locale switcher is allowed',
    findTell(byId['emoji-glyph'], flag, 'apps/web/src/components/locale-switcher.tsx').length === 0,
  );
  check(
    'a flag anywhere else is flagged',
    findTell(byId['emoji-glyph'], flag, 'apps/web/src/components/header.tsx').length === 1,
  );
  check(
    'a pictograph in a country picker is still flagged',
    findTell(byId['emoji-glyph'], '<b>✨</b>', 'apps/web/src/components/country-picker.tsx').length === 1,
  );
  check(
    'emoji in messages json is read',
    findTell(byId['emoji-glyph'], '{"a": "🛒 Cart"}', 'apps/web/messages/en.json').length === 1,
  );

  const vague = byId['vague-success'];
  check(
    'a dynamic toast is counted, not matched',
    countDynamic(vague, "addToast(msg, 'success')") === 1 && findTell(vague, "addToast(msg, 'success')").length === 0,
  );
  check('a dynamic SuccessState title is counted', countDynamic(vague, '<SuccessState title={t("done")} />') === 1);
  check(
    'a dynamic notice-success body is counted',
    countDynamic(vague, '<p className="notice notice-success">{notice}</p>') === 1,
  );
  check('a literal is not counted as dynamic', countDynamic(vague, "addToast('Saved', 'success')") === 0);

  const one = tellsInFile('apps/web/src/components/x.tsx', '<div className="shadow-xl transition-all">');
  check('one file lists each tell with its line', one.length === 2 && one.every((r) => r.lines[0] === 1));
  check('a file outside the scanned apps lists nothing', tellsInFile('scripts/x.tsx', 'shadow-xl').length === 0);
  check(
    'a style tell is not listed for a mobile file',
    tellsInFile('apps/mobile/app/x.tsx', '<View className="shadow-xl">').length === 0,
  );

  const gradient = byId['gradient-surface'];
  const base = { 'gradient-surface': { 'a.css': 2 } };
  check('over the baseline fails', compare(gradient, { 'a.css': [1, 2, 3] }, base).over.length === 1);
  check('at the baseline passes', compare(gradient, { 'a.css': [1, 2] }, base).over.length === 0);
  check('a file with no baseline entry allows none', compare(gradient, { 'b.tsx': [4] }, base).over.length === 1);
  check('below the baseline passes and asks to lower it', compare(gradient, { 'a.css': [1] }, base).under.length === 1);
  check('a baseline file with no hits left asks to be removed', compare(gradient, {}, base).under.length === 1);

  let failed = 0;
  for (const [what, ok] of cases) {
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  }
  if (failed) {
    console.error(`\n${failed} self-test case(s) failed: the matcher does not do what this file says it does.\n`);
    process.exit(1);
  }
  console.log(
    `\nSelf-test OK (${cases.length} cases): ${TELLS.length} tells catch what they claim and spare what they should.`,
  );
}

function listFiles(paths) {
  for (const path of paths) {
    const rel = relative(ROOT, resolve(path)).split(sep).join('/');
    let text;
    try {
      text = readFileSync(resolve(path), 'utf8');
    } catch {
      console.error(`${rel}: cannot read it.`);
      continue;
    }
    const found = tellsInFile(rel, text);
    if (found.length === 0) console.log(`${rel}: no tells.`);
    for (const { tell, lines, dynamic } of found) {
      for (const line of lines) console.log(`${rel}:${line}  ${tell.id}  ${tell.why}. Instead: ${tell.instead}.`);
      if (dynamic) console.log(`${rel}  ${tell.id}  ${dynamic} written as expressions and not checked.`);
    }
  }
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const paths = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (paths.length > 0) return listFiles(paths);

  const { hits, dynamic, files } = scan();
  if (files === 0) {
    // A check that read nothing found nothing, and printing OK for that is the one lie a lint must not tell:
    // a moved folder or a wrong working directory would turn every tell green.
    console.error('Tells scanned 0 files. Run from the repository root; SOURCES lists the folders it reads.');
    process.exit(1);
  }
  const growth = [];
  const lower = [];
  const summary = [];
  for (const tell of TELLS) {
    const total = Object.values(hits[tell.id]).reduce((n, lines) => n + lines.length, 0);
    const allowed = Object.values(BASELINE[tell.id] ?? {}).reduce((n, cap) => n + cap, 0);
    const extra = tell.dynamic ? `, ${dynamic[tell.id]} written as expressions and not checked` : '';
    summary.push(
      `  ${tell.id.padEnd(17)} ${String(total).padStart(3)} found, ${String(allowed).padStart(3)} in the baseline${extra}`,
    );
    const result = compare(tell, hits[tell.id]);
    for (const o of result.over) growth.push({ tell, ...o });
    for (const u of result.under) lower.push({ tell, ...u });
  }

  console.log(`Tells: scanned ${files} files.\n${summary.join('\n')}`);

  for (const u of lower) {
    console.log(
      `  baseline for ${u.tell.id} in ${u.file} is ${u.cap} and the count is ${u.count}: lower BASELINE in scripts/check-tells.mjs.`,
    );
  }

  if (growth.length === 0) {
    console.log('Tells OK: nothing the baseline does not already account for.');
    return;
  }

  for (const g of growth) {
    console.error(`\n${g.tell.id}: ${g.file} has ${g.lines.length} line(s), ${g.cap} allowed. ${g.tell.why}.`);
    for (const line of g.lines) console.error(`  ${g.file}:${line}`);
    console.error(`  Instead: ${g.tell.instead}.`);
  }
  console.error(
    '\nA tell may shrink and may not grow. Fix the line, or, if it is a legitimate remainder (a scrim over a\n' +
      'photograph, a flag in a country picker), add it to BASELINE in scripts/check-tells.mjs with the reason.\n',
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

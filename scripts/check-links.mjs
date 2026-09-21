#!/usr/bin/env node
/**
 * Enforces ITG-2, ITG-3 and ITG-5 — every internal reference resolves, and
 * every screen is reachable.
 *
 * Three failures, one walk, because they are one family: a reference to
 * something that must exist, and does not.
 *
 *   ITG-2  a link to a route that is not there        → a 404 a user finds
 *   ITG-3  an image path with no file behind it       → a broken-image glyph
 *   ITG-5  a screen nothing links to                  → shipped, unreachable
 *
 * Why these are worth a script rather than care: in a modular product the
 * usual cause of a broken link is not a typo. It is a link that was correct
 * in development, where every module is switched on, and is a dead end in the
 * deployment that did not buy that module (MOD-4). Nobody finds that by
 * clicking, because nobody clicks the combination it breaks in.
 *
 * What it cannot see, said plainly so a pass is not mistaken for proof: a
 * path assembled at runtime from a variable it cannot evaluate, a link
 * rendered only under a condition, and whether a reachable screen is
 * reachable *by the person looking at it* — that last one is PRM-3 and needs
 * both a render and a capability fixture (docs/design/15-integrity.md,
 * checks 6 and 9). Neither exists yet.
 *
 * Run by `pnpm lint` and by CI. `--self-test` proves the matcher against
 * known-good and known-bad pairs.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, basename } from 'node:path';

const ROOT = resolve('.');
const SKIP_DIRS = new Set(['node_modules', '.next', '.expo', 'dist', 'build', 'generated', 'coverage', '.turbo']);
const SOURCE_EXT = new Set(['.ts', '.tsx']);

/** The apps with a Next.js app router, and where each one's assets live. */
const APPS = [
  { name: 'web', appDir: 'apps/web/src/app', src: 'apps/web/src', publicDir: 'apps/web/public' },
  { name: 'pos', appDir: 'apps/pos/src/app', src: 'apps/pos/src', publicDir: 'apps/pos/public' },
];

/**
 * Screens that nothing links to on purpose, with the reason. A route reached
 * by the framework, by an email, or by a redirect from outside this codebase
 * is not an orphan — but it has to say so here rather than just not being
 * found.
 */
const REACHABLE_WITHOUT_A_LINK = [
  { match: /\/(_not-found|not-found|error|global-error|loading|template|default)$/, reason: 'rendered by Next.js itself, never linked' },
  { match: /^\/api\//, reason: 'an HTTP endpoint, not a screen' },
  { match: /^\/\[locale\]$/, reason: 'the storefront root — linked as `/`' },
  {
    match: /^\/checkout\/callback\//,
    reason:
      'a payment provider redirects the customer here after they pay. The entry point is ' +
      'JAZZCASH_RETURN_URL / EASYPAISA_RETURN_URL in the environment, not a link in this codebase — ' +
      'which is exactly why it must be listed: a route with no inbound link and no entry here is an ' +
      'orphan, and this one is not.',
  },
  { match: /^\/favicon\.ico$/, reason: 'requested by the browser, never linked' },
];

/* ── the route inventory ───────────────────────────────────────────────── */

function* files(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* files(full);
    else yield full;
  }
}

/** The URL a `page.tsx` / `route.ts` serves: route groups vanish, `[id]` stays. */
export function routeUrl(rel, appDir) {
  const segments = rel.slice(appDir.length).replace(/^\/+/, '').split('/');
  segments.pop();
  const url = segments.filter((s) => !(s.startsWith('(') && s.endsWith(')')) && !s.startsWith('@')).join('/');
  return `/${url}`.replace(/\/$/, '') || '/';
}

/* ── matching a link against a route ───────────────────────────────────── */

const PLACEHOLDER = ':x';

/**
 * Does `link` land on `route`?
 *
 * `[id]` takes one segment, `[...rest]` takes one or more, `[[...rest]]`
 * takes none or more.
 *
 * A `:x` in the link is a value the checker could not evaluate, and it
 * matches a DYNAMIC route segment only — never a literal one. An
 * interpolated value is an id or a slug, and an id lands in a `[param]`; a
 * literal segment is path structure, not a value. Letting `:x` match a
 * literal is how `/product/${slug}` resolves against `/[locale]/cart`, with
 * `[locale]` swallowing "product" and `:x` standing in for "cart" — which
 * then reports the real product page as unreachable.
 */
export function matches(link, route) {
  const l = link.split('/').filter(Boolean);
  const r = route.split('/').filter(Boolean);
  let i = 0;
  for (let j = 0; j < r.length; j += 1) {
    const seg = r[j];
    if (seg.startsWith('[[...')) return true;          // optional catch-all: the rest is anything
    if (seg.startsWith('[...')) return i < l.length;   // catch-all: needs at least one
    if (i >= l.length) return false;
    if (seg.startsWith('[')) { i += 1; continue; }     // a route param takes anything
    if (l[i] === PLACEHOLDER) return false;            // a value cannot be a literal segment
    if (seg !== l[i]) return false;
    i += 1;
  }
  return i === l.length;
}

/**
 * How specific a route is: a literal segment beats a dynamic one.
 *
 * `routes.find()` returns whatever the filesystem walk happened to yield
 * first, so `/admin/products/new` would resolve against `/admin/products/[id]`
 * and leave the real `new` screen looking like an orphan. Resolving to the
 * most specific match is what Next.js itself does, and it is the difference
 * between this check reporting 27 orphans and reporting the truth.
 */
const score = (link, route) => {
  const l = link.split('/').filter(Boolean);
  const r = route.split('/').filter(Boolean);
  let n = 0;
  for (let i = 0; i < r.length; i += 1) {
    const seg = r[i];
    const lit = l[i];
    if (seg.startsWith('[[...') || seg.startsWith('[...')) { n += 1; continue; }
    if (seg.startsWith('[')) { n += lit === PLACEHOLDER ? 4 : 2; continue; }
    n += lit === PLACEHOLDER ? 1 : 4;
  }
  return n;
};

/** The route Next.js would pick for this link, or null. */
export function resolve1(link, routes) {
  const candidates = routes.filter((r) => matches(link, r.url));
  if (!candidates.length) return null;
  return candidates.sort((a, b) => score(link, b.url) - score(link, a.url))[0];
}

/**
 * Every route this link can reach — not just the best one.
 *
 * For "is this link broken" the best match is the answer. For "does anything
 * lead here" it is the wrong question: `ROUTES.admin.product(id)` produces
 * `/admin/products/:x`, where `:x` is a value this checker cannot evaluate.
 * That link genuinely can land on `/admin/products/[id]` OR on
 * `/admin/products/new`, so both are reached, and crediting only the winner
 * of a tie-break invents orphans.
 */
const reaches = (link, routes) => routes.filter((r) => matches(link, r.url));

/**
 * Resolve a link, trying it both as written and with a locale prefix.
 *
 * Storefront paths are locale-relative by design — `ROUTES.storefront.cart`
 * is `/cart`, and `/[locale]/cart` serves it. But `/cart` *also* matches the
 * bare `/[locale]` route, with "cart" read as the locale. Both are real
 * matches, so picking the first one found is a coin toss; the better-scoring
 * one is the one Next.js would actually serve.
 */
function resolveLink(path, routes) {
  const prefixed = `/${PLACEHOLDER}${path === '/' ? '' : path}`;
  const options = [
    { from: path, hit: resolve1(path, routes) },
    { from: prefixed, hit: resolve1(prefixed, routes) },
  ].filter((o) => o.hit);
  if (!options.length) return null;
  return options.sort((a, b) => score(b.from, b.hit.url) - score(a.from, a.hit.url))[0];
}

/* ── extracting links ──────────────────────────────────────────────────── */

const clean = (p) =>
  p.replace(/\$\{[^}]*\}/g, PLACEHOLDER)   // an interpolated value
    .replace(/[?#].*$/, '')                // query and hash are not the route
    .replace(/\/+$/, '') || '/';

/** Every internal path a file refers to, with the line it is on. */
export function scanLinks(source) {
  const out = [];
  const patterns = [
    /\bhref=\{?[`'"](\/[^`'"]*)[`'"]/g,
    /\brouter\.(?:push|replace|prefetch)\(\s*[`'"](\/[^`'"]*)[`'"]/g,
    /\bredirect\(\s*[`'"](\/[^`'"]*)[`'"]/g,
  ];
  // Deliberately NOT `path:` — the nav registry uses `href:`, which the first
  // pattern already catches, while `path:` also matches the API export paths
  // in the reports screen. Those are endpoints on apps/api, not Next routes,
  // and reporting them as broken links is the kind of false positive that
  // gets a checker switched off.
  source.split('\n').forEach((line, i) => {
    for (const re of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) out.push({ path: clean(m[1]), line: i + 1 });
    }
  });
  return out;
}

/** Every path the ROUTES registry can produce — literals and arrow bodies. */
function scanRouteRegistry(source) {
  const out = [];
  source.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/[:=>]\s*[`'"](\/[^`'"]*)[`'"]/g)) out.push({ path: clean(m[1]), line: i + 1 });
  });
  return out;
}

/** Every local asset a file points at (`/logo.png`, not an http URL). */
function scanAssets(source) {
  const out = [];
  source.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/\b(?:src|poster|icon|image|logoRaster)\s*[=:]\s*\{?[`'"](\/[^`'"${}]*\.[a-z0-9]{2,5})[`'"]/gi)) {
      out.push({ path: m[1], line: i + 1 });
    }
  });
  return out;
}

/* ── self-test ─────────────────────────────────────────────────────────── */

function selfTest() {
  const cases = [
    ['/admin/orders', '/admin/orders', true, 'an exact path'],
    ['/admin/orders', '/admin/order', false, 'a near miss'],
    ['/admin/orders/42', '/admin/orders/[id]', true, 'a dynamic segment'],
    ['/admin/orders/42/receive', '/admin/orders/[id]', false, 'one segment too many'],
    ['/admin/orders', '/admin/orders/[id]', false, 'one segment too few'],
    ['/admin/orders/:x', '/admin/orders/[id]', true, 'an interpolated value'],
    ['/product/:x', '/[locale]/cart', false, 'a value standing in for a literal segment'],
    ['/shop/a/b/c', '/shop/[...rest]', true, 'a catch-all'],
    ['/shop', '/shop/[...rest]', false, 'a catch-all with nothing to catch'],
    ['/shop', '/shop/[[...rest]]', true, 'an optional catch-all'],
    ['/en/product/x', '/[locale]/product/[slug]', true, 'a locale prefix'],
  ];
  const cleanCases = [
    ['/shop?category=unstitched', '/shop', 'a query string'],
    ['/product/${slug}', '/product/:x', 'an interpolation'],
    ['/admin/orders/', '/admin/orders', 'a trailing slash'],
    ['/#top', '/', 'a hash on the root'],
  ];

  // The bug this exists to prevent: a literal that also matches a dynamic
  // sibling must resolve to the literal, the way Next.js resolves it.
  const routeSet = [
    { url: '/admin/products/[id]' },
    { url: '/admin/products/new' },
    { url: '/admin/products' },
  ];
  const resolved = resolve1('/admin/products/new', routeSet);
  const resolvedOk = resolved?.url === '/admin/products/new';
  const dynamic = resolve1('/admin/products/42', routeSet);
  const dynamicOk = dynamic?.url === '/admin/products/[id]';

  let failed = 0;
  if (!resolvedOk) failed += 1;
  console.log(`  ${resolvedOk ? 'ok  ' : 'FAIL'}  prefers a literal route over a dynamic sibling`);
  if (!dynamicOk) failed += 1;
  console.log(`  ${dynamicOk ? 'ok  ' : 'FAIL'}  still resolves a real id to the dynamic route`);

  for (const [link, route, expected, what] of cases) {
    const got = matches(link, route);
    const ok = got === expected;
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${expected ? 'matches' : 'rejects'} ${what}`);
  }
  for (const [raw, expected, what] of cleanCases) {
    const got = clean(raw);
    const ok = got === expected;
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  strips ${what}${ok ? '' : ` (got ${got}, wanted ${expected})`}`);
  }

  if (failed) {
    console.error(`\n${failed} self-test case(s) failed — the matcher does not do what this file says it does.\n`);
    process.exit(1);
  }
  console.log(`\nSelf-test OK (${cases.length + cleanCases.length + 2} cases) — resolution and normalisation behave as documented.`);
}

/* ── main ──────────────────────────────────────────────────────────────── */

function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  const problems = { links: [], assets: [], orphans: [] };
  let scanned = 0;
  let routeCount = 0;

  for (const app of APPS) {
    const appDir = join(ROOT, app.appDir);
    if (!existsSync(appDir)) continue;

    // 1. What exists.
    const routes = [];
    for (const file of files(appDir)) {
      const base = basename(file);
      if (!/^(page|route)\.(tsx?|jsx?)$/.test(base)) continue;
      routes.push({ url: routeUrl(relative(ROOT, file), app.appDir), file: relative(ROOT, file) });
    }
    if (!routes.length) {
      console.error(`\nFound no routes under ${app.appDir}. Either the app moved or this check is\nreading the wrong place; it fails rather than reporting every link broken.\n`);
      process.exit(1);
    }
    routeCount += routes.length;

    // 2. What is referred to.
    const referenced = new Set();
    const links = [];
    const assets = [];
    for (const file of files(join(ROOT, app.src))) {
      if (!SOURCE_EXT.has(file.slice(file.lastIndexOf('.')))) continue;
      const rel = relative(ROOT, file);
      if (/\.(spec|e2e-spec|test)\.tsx?$/.test(basename(rel))) continue;
      scanned += 1;
      const source = readFileSync(file, 'utf8');
      const found = rel.endsWith('constants/routes.ts') ? scanRouteRegistry(source) : scanLinks(source);
      for (const l of found) links.push({ ...l, file: rel });
      for (const a of scanAssets(source)) assets.push({ ...a, file: rel });
    }

    // 3. ITG-2 — does each link land somewhere?
    for (const l of links) {
      const resolved = resolveLink(l.path, routes);
      if (!resolved) {
        problems.links.push({ ...l, app: app.name });
        continue;
      }
      // Credit every route this link can reach, not just the best match —
      // see `reaches`.
      for (const r of reaches(resolved.from, routes)) referenced.add(r.url);
    }

    // 4. ITG-5 — does anything lead to each route?
    for (const r of routes) {
      if (referenced.has(r.url)) continue;
      if (REACHABLE_WITHOUT_A_LINK.some((x) => x.match.test(r.url))) continue;
      problems.orphans.push({ ...r, app: app.name });
    }

    // 5. ITG-3 — is the file behind each asset actually there?
    for (const a of assets) {
      if (existsSync(join(ROOT, app.publicDir, a.path.replace(/^\//, '')))) continue;
      problems.assets.push({ ...a, app: app.name, lookedIn: app.publicDir });
    }
  }

  const total = problems.links.length + problems.assets.length + problems.orphans.length;
  if (!total) {
    console.log(`Links OK (${scanned} files, ${routeCount} routes — every link resolves, every asset exists, no orphan screen)`);
    return;
  }

  console.error('');
  if (problems.links.length) {
    console.error(`ITG-2 — ${problems.links.length} link(s) to a route that does not exist:\n`);
    for (const p of problems.links) console.error(`  ${p.file}:${p.line}\n    links to ${p.path} — no route in apps/${p.app} serves it\n`);
  }
  if (problems.assets.length) {
    console.error(`ITG-3 — ${problems.assets.length} asset(s) with no file behind them:\n`);
    for (const p of problems.assets) console.error(`  ${p.file}:${p.line}\n    points at ${p.path} — not found in ${p.lookedIn}\n`);
  }
  if (problems.orphans.length) {
    console.error(`ITG-5 — ${problems.orphans.length} screen(s) nothing links to:\n`);
    for (const p of problems.orphans) console.error(`  ${p.file}\n    serves ${p.url} — reachable only by typing the URL\n`);
  }
  console.error(
    `A link that does not resolve is a dead end (ITG-1); a screen nothing links to is\n` +
    `unshipped, whatever its state of completion (NAV-6). See docs/design/15-integrity.md.\n\n` +
    `A route the framework reaches on its own, or one linked from outside this codebase,\n` +
    `belongs in REACHABLE_WITHOUT_A_LINK in this file, with the reason.\n`,
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

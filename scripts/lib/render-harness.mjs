/**
 * Boots the real stack (Postgres already running, api + web + pos as real
 * servers) and drives it with a real browser — the shared infrastructure
 * every render-based integrity check needs.
 *
 * `docs/design/process-governance/15-integrity.md`'s build order calls checks 6 through 10 "a
 * capability in their own right — a render harness, a route inventory, a
 * module matrix and a capability fixture set." This is that harness.
 * `scripts/check-overflow.mjs` (ITG-4, check 6) is its first user; checks 7
 * through 10 are "6, plus X" and extend this file rather than rebuilding it.
 *
 * Deliberate boundaries, so a caller knows what it is and is not getting:
 *
 *   - It boots PRODUCTION builds (`next start` / `node dist/main.js`), not
 *     dev servers — dev mode's on-demand compilation makes the first hit of
 *     every route slow in a way that has nothing to do with the check, and
 *     production is what actually ships.
 *   - It does NOT start or seed Postgres. Every other slow gate in this repo
 *     (`pnpm test`, `pnpm build`) makes the same assumption; a render check
 *     is not the place to first introduce database lifecycle management.
 *   - It authenticates by calling the real `/auth/login` endpoint and
 *     injecting the resulting tokens into `localStorage` before any app
 *     script runs (`context.addInitScript`) — not by fabricating a token.
 *     If login is broken, every authenticated check fails loudly, which is
 *     correct: a check that cannot authenticate must not silently skip the
 *     entire authenticated surface.
 *   - Mobile (`apps/mobile`) is out of scope, permanently, not by oversight.
 *     It is React Native; there is no viewport to overflow and no DOM for
 *     Playwright to drive. The seven widths in Law 4 are a CSS concept.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

/* ── the seven widths ─────────────────────────────────────────────────── */

/**
 * Law 4's own numbers, read from `CLAUDE.md` / `docs/design/layout-composition/02-layout.md`,
 * NOT from `apps/web/tailwind.config.ts`.
 *
 * They disagree, and it is worth saying so here rather than silently
 * resolving it one way. The law names `xs 280 · sm 380 · fold 640 · md 768 ·
 * lg 1024 · xl 1280 · 2xl 1536`. The Tailwind config instead defines
 * `xs: 380, sm: 640, fold: 672` (with nothing named at 280 — the config's
 * own comment treats it as "below xs, base styles only") and explains why:
 * `fold` was retuned to 672px against measured device widths (a Z Fold
 * opened into tablet mode is ~673-717px), while the law's round number
 * predates that measurement.
 *
 * This checker verifies the LAW, because that is what ITG-4 says to verify
 * ("Law 4 names ... No horizontal page scroll at any of them") — the law is
 * the thing with the citable authority, a CSS breakpoint name is an
 * implementation detail. But reconciling the two — renaming breakpoints
 * touches every `xs:`/`sm:`/`fold:` utility in the codebase — is a real
 * decision this file does not make. It is named here so it is visible, not
 * fixed here so it is silent.
 */
export const WIDTHS = [
  { name: 'xs', width: 280 },
  { name: 'sm', width: 380 },
  { name: 'fold', width: 640 },
  { name: 'md', width: 768 },
  { name: 'lg', width: 1024 },
  { name: 'xl', width: 1280 },
  { name: '2xl', width: 1536 },
];

const HEIGHT = 900;

/* ── booting a server and waiting for it to answer ──────────────────────── */

/**
 * Poll a URL until it returns any HTTP response (not necessarily 2xx — a
 * 404 still proves the server is up), or throw after `timeoutMs`.
 */
async function waitForHttp(url, { timeoutMs = 60_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok || res.status < 500) return;
      lastError = new Error(`${url} → HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${url} to respond: ${lastError?.message ?? 'unknown error'}`);
}

/**
 * Spawn a long-running server process. Returns a handle with `.stop()`.
 *
 * stdout/stderr are captured into a ring buffer rather than inherited, so a
 * failed boot can print the last output that explains why, without three
 * servers' worth of routine request logs drowning the actual check output.
 */
export function spawnServer({ label, cwd, command, args, env, readyUrl, timeoutMs = 90_000 }) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const tail = [];
  const capture = (chunk) => {
    tail.push(chunk.toString());
    if (tail.length > 200) tail.shift();
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  let exited = false;
  let exitInfo = null;
  child.on('exit', (code, signal) => {
    exited = true;
    exitInfo = { code, signal };
  });

  const ready = (async () => {
    if (exited) throw new Error(`${label} exited before it could start:\n${tail.join('')}`);
    try {
      await waitForHttp(readyUrl, { timeoutMs });
    } catch (error) {
      const detail = exited ? `it exited (code ${exitInfo.code}, signal ${exitInfo.signal})` : 'it never answered';
      throw new Error(`${label} did not become ready — ${detail}:\n${tail.join('').slice(-4000)}\n${error.message}`);
    }
    if (exited) throw new Error(`${label} exited immediately after answering once:\n${tail.join('')}`);
  })();

  return {
    ready,
    get pid() {
      return child.pid;
    },
    tail: () => tail.join(''),
    async stop() {
      if (exited) return;
      child.kill('SIGTERM');
      await Promise.race([
        new Promise((res) => child.once('exit', res)),
        sleep(5000).then(() => child.kill('SIGKILL')),
      ]);
    },
  };
}

/* ── auth: real login, injected before any app script runs ─────────────── */

/** `POST /auth/login` against a running API. Throws with the API's own message on failure. */
export async function login(apiUrl, identifier, password) {
  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`login(${identifier}) → HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * A browser context pre-authenticated for one app's storage convention.
 *
 * `storageEntries` is `{ [localStorageKey]: value }` — already the exact
 * shape each app's own client code reads (`STORAGE_KEYS.admin.*`,
 * `STORAGE_KEYS.customer.*`, or POS's flat `STORAGE_KEYS`), so this file
 * does not need to know what any of them mean, only where to put them.
 *
 * `addInitScript` runs before the page's own first script on EVERY
 * navigation in this context, which is what makes this reliable — there is
 * no race between the app checking for a session and this having written
 * one, and it does not need re-arming per page.
 */
export async function authedContext(browser, { origin, storageEntries }) {
  const context = await browser.newContext({ viewport: { width: WIDTHS[0].width, height: HEIGHT } });
  await context.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, storageEntries);
  // The init script only fires on navigation; visiting the origin once here
  // means storage is already primed before the harness's first real visit,
  // rather than depending on the first tested route happening to be first.
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.close();
  return context;
}

/* ── measuring overflow ──────────────────────────────────────────────────── */

/**
 * `document.documentElement.scrollWidth > clientWidth` at the current
 * viewport, plus — when it does — the single element whose right edge
 * reaches furthest past the viewport, because "this page overflows" is a
 * finding nobody can act on and "this page overflows because of `.sku-code`"
 * is one a person can fix in the next five minutes.
 *
 * A 1px tolerance absorbs sub-pixel layout rounding, which is real and not
 * a defect — without it this would flag pages that are visually perfect.
 */
export async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const clientWidth = doc.clientWidth;
    const scrollWidth = doc.scrollWidth;
    const TOLERANCE = 1;
    if (scrollWidth <= clientWidth + TOLERANCE) {
      return { overflowPx: 0, scrollWidth, clientWidth, culprit: null };
    }

    // An element inside a properly-working `overflow-x-auto` region (a data
    // table meant to scroll on its own) reports a huge, unclipped
    // `getBoundingClientRect()` no matter how well-behaved it is — clipping
    // is a paint-time effect, not a layout one, so the box's own geometry
    // still reads as if nothing were containing it. Counting that as "the
    // culprit" was a real bug this file shipped with: the first live run
    // against this product reported a table as overflowing 280px when the
    // table was working exactly as designed, and the actual leak — 38px,
    // real — was a sibling element inside the same `<main>`. So a candidate
    // only counts if NONE of its ancestors up to `<body>` already clips
    // horizontally; an ancestor that clips is evaluated on its own terms in
    // this same walk, since it is itself in `body, body *`.
    const hasClippingAncestor = (el) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ov = getComputedStyle(a).overflowX;
        if (ov === 'auto' || ov === 'scroll' || ov === 'hidden' || ov === 'clip') return true;
      }
      return false;
    };

    let worst = null;
    let worstRight = clientWidth + TOLERANCE;
    // `*` over the whole document, not just body — a culprit can be a fixed
    // or absolutely positioned element anywhere in the tree.
    for (const el of document.querySelectorAll('body, body *')) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (hasClippingAncestor(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right > worstRight) {
        worstRight = rect.right;
        worst = el;
      }
    }

    const describe = (el) => {
      if (!el) return null;
      const cls =
        typeof el.className === 'string' && el.className.trim()
          ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
          : '';
      const id = el.id ? `#${el.id}` : '';
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
      return { selector: `${el.tagName.toLowerCase()}${id}${cls}`, text };
    };

    return {
      overflowPx: Math.round(scrollWidth - clientWidth),
      scrollWidth,
      clientWidth,
      culprit: describe(worst),
    };
  });
}

/**
 * One navigation, then a resize-and-measure at every width — not a reload
 * per width. CSS responds to viewport size reactively; reloading seven
 * times per page multiplies wall-clock cost for no fidelity this check
 * needs, and is not how a user actually resizes a window.
 *
 * The navigation itself waits for `load` (the DOM, CSS and scripts are all
 * in), never `networkidle` — this app polls (an inbox badge, a live queue,
 * a notification count), so "zero in-flight requests for 500ms" never
 * happens and `networkidle` hangs until its own timeout on every such page.
 * That is not a hypothetical: it is exactly what the first real run of this
 * checker hit, on every `apps/web` route, and it is why this comment exists.
 *
 * But most of this product's admin screens fetch their data CLIENT-SIDE
 * after mount (`adminFetch` in a `useEffect`), so `load` alone can fire
 * while the page still shows a loading skeleton — measuring THAT would
 * silently miss the real content's overflow, which is the actual thing
 * worth catching (a long SKU, a long name, a wide table). So after `load`
 * this gives the page one BOUNDED chance to go quiet
 * (`waitForLoadState('networkidle')`, capped short and never fatal) — long
 * enough for a local fetch to land, never long enough to be held hostage by
 * a poll that runs forever.
 */
export async function sweepWidths(page, url, { waitUntil = 'load', settleMs = 150, dataSettleMs = 4000, navTimeoutMs = 30_000 } = {}) {
  await page.setViewportSize({ width: WIDTHS[0].width, height: HEIGHT });
  await page.goto(url, { waitUntil, timeout: navTimeoutMs });
  await page.waitForLoadState('networkidle', { timeout: dataSettleMs }).catch(() => {});
  const results = [];
  for (const { name, width } of WIDTHS) {
    await page.setViewportSize({ width, height: HEIGHT });
    await page.waitForTimeout(settleMs); // one paint cycle for CSS to settle
    const measurement = await measureOverflow(page);
    results.push({ width: name, px: width, ...measurement });
  }
  return results;
}

/**
 * `/opt/pw-browsers/chromium` is where THIS repository's own sandboxed dev
 * environment pre-installs Chromium (see the environment note this session
 * started with) — real, and worth using directly rather than re-downloading
 * a browser that is already on disk. It is not where a normal machine or a
 * GitHub Actions runner keeps one, so it is used only when it is actually
 * there; everywhere else this falls through to Playwright's own managed
 * browser (`npx playwright install chromium`, or `PLAYWRIGHT_BROWSERS_PATH`
 * if set), found the ordinary way by omitting `executablePath` entirely.
 */
function chromiumExecutable() {
  const candidate = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium';
  return existsSync(candidate) ? candidate : undefined;
}

export async function launchBrowser() {
  return chromium.launch({
    executablePath: chromiumExecutable(),
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // Chromium makes a handful of background requests by default (update
      // checks, Safe Browsing, GAIA) that have nothing to do with the page
      // under test and only add noise — and cost — against a network egress
      // proxy that (correctly) does not know what to do with them.
      '--disable-background-networking',
      '--disable-sync',
      '--disable-features=Translate,OptimizationHints',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
}

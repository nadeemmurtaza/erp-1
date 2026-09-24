#!/usr/bin/env node
/**
 * Enforces ITG-4 — nothing overflows at any of Law 4's seven widths.
 *
 * `docs/design/process-governance/15-integrity.md` names this check 6, the first of the ten
 * that needs a running app rather than static analysis, and ranks it above
 * checks 7-10 because they all build on the same render harness
 * (`scripts/lib/render-harness.mjs`) this one establishes.
 *
 * What it does, for real, against the real stack:
 *
 *   1. Boots apps/api, apps/web and apps/pos as PRODUCTION servers
 *      (`next start` / `node dist/main.js`) against whatever database
 *      DATABASE_URL points at — already migrated and seeded, exactly the
 *      precondition `pnpm test` and `pnpm build` already assume.
 *   2. Logs in for real (admin, a customer, a POS operator) via
 *      `POST /auth/login`, and — for POS — registers a terminal and opens a
 *      shift for real too, because `/till` will not render without one.
 *   3. Resolves every dynamic route's `[id]` (etc.) against a real row,
 *      fetched from the same live API the page itself will call — see
 *      FIXTURES below. A route with no resolvable fixture is reported as
 *      SKIPPED, by name, never silently dropped and never counted as a pass.
 *   4. For every concrete URL, one navigation, then a resize-and-measure at
 *      each of the seven widths (`sweepWidths` — CSS responds to viewport
 *      size without a reload, so this is seven cheap measurements per page
 *      load, not seven page loads).
 *   5. Reports failures with the width, the overflow in pixels, and — where
 *      findable — the element whose right edge caused it.
 *
 * Scope, stated rather than implied:
 *
 *   - `apps/mobile` is excluded permanently (see render-harness.mjs) — this
 *     is a CSS/viewport concept and React Native has neither.
 *   - Zoom (`ACC-8`'s "100% and 200%") is NOT covered — see WIDTHS' own
 *     comment for why the seven widths already reach narrower than a 200%
 *     zoom at a typical viewport, and 320px CSS-width reflow (WCAG 1.4.10)
 *     is the more standard proxy. True 200% *browser* zoom is a named gap,
 *     not a silent one.
 *   - `/[locale]/stitching/[number]` has no resolvable fixture — there is
 *     no "my bookings" endpoint a signed-in customer can list from, only a
 *     guest number+phone lookup. Reported as SKIPPED every run, by design,
 *     until that gap is closed (a product gap this check merely surfaces,
 *     not one it can work around).
 *
 * Slow, and deliberately not part of `pnpm lint` — `docs/design/15-integrity
 * .md`: "Checks 6–10 need a running app and belong in CI as their own job."
 * Run as `pnpm check:overflow`. `--self-test` proves the overflow-detection
 * and culprit-finding logic against synthetic pages, with no server, no
 * database and no network — the same reason every other checker in this
 * repository has one: a run against the live app proves nothing about
 * whether the MATH is right, only that it printed something.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  WIDTHS,
  spawnServer,
  login,
  authedContext,
  sweepWidths,
  measureOverflow,
  launchBrowser,
} from './lib/render-harness.mjs';
import { APPS, routeInventory } from './check-links.mjs';

const ROOT = resolve('.');
const LOCALES = ['en', 'ur']; // BRAND.locale.locales, restated: see the note in buildTargets()

const PORTS = { api: 3001, web: 3000, pos: 3002 };
const API_URL = `http://localhost:${PORTS.api}/api/v1`;
const WEB_URL = `http://localhost:${PORTS.web}`;
const POS_URL = `http://localhost:${PORTS.pos}`;

/**
 * `next start` serves every one of these routes from ONE production server
 * process, most of it on its single JS main thread — a real bottleneck a
 * headless browser's own concurrency doesn't route around. At concurrency 4
 * on a 4-core box, the first live run of this checker (this file's own
 * sandbox) measured `next-server` pinned near 70% CPU and most navigations
 * queued past the 30s default, reporting a false "Failed to load" for
 * three-quarters of the sweep — not an overflow finding, a resource-
 * contention artifact `ITG-14` forbids passing off as one. Both knobs are
 * overridable so a beefier CI runner can raise them back.
 */
const CONCURRENCY = Number(process.env.OVERFLOW_CONCURRENCY) || 2;
const NAV_TIMEOUT_MS = Number(process.env.OVERFLOW_NAV_TIMEOUT_MS) || 60_000;

/* ── credentials — the seed script's own defaults, overridable the same way it is ── */

const ADMIN = { identifier: process.env.SEED_ADMIN_EMAIL || 'admin@yaseen.pk', password: process.env.SEED_ADMIN_PASSWORD || 'admin12345' };
const CUSTOMER = { identifier: 'ayesha@example.com', password: 'customer12345' };

/* ── storage keys each app's client code reads — kept in one place so a ──
   rename in constants/storage.ts breaks this loudly, not silently ──────── */

const WEB_ADMIN_KEYS = { access: 'newax.admin.access', refresh: 'newax.admin.refresh', user: 'newax.admin.user' };
const WEB_CUSTOMER_KEYS = { access: 'newax.customer.access', refresh: 'newax.customer.refresh', user: 'newax.customer.user' };
const POS_KEYS = { access: 'pos.access_token', refresh: 'pos.refresh_token', user: 'pos.user', terminalId: 'pos.terminal_id', shiftId: 'pos.shift_id' };

/* ── fixture resolution ───────────────────────────────────────────────────
 *
 * One entry per dynamic PARAMETER NAME that needs a real value, resolved
 * from a live list endpoint under the ADMIN token (the same one every one
 * of these screens is itself gated behind). `pick` takes that endpoint's
 * JSON and returns the value, or undefined if the resource is empty —
 * undefined means "no fixture", reported by name, never guessed.
 *
 * This is deliberately keyed by param name, not by route: `[id]` means a
 * different resource on every route that uses it, so the route-to-fixture
 * table below names the param EACH route actually needs, and this table
 * only has to say how to fetch one of each underlying resource once.
 */
const FIXTURE_SOURCES = {
  productId: { path: '/admin/catalog/products', pick: firstId },
  productSlug: { path: '/catalog/products', pick: (json) => firstOf(json)?.slug },
  optionGroupId: { path: '/admin/stitching/option-groups', pick: firstId },
  garmentTypeId: { path: '/admin/measurements/garment-types', pick: firstId },
  emailAccountId: { path: '/admin/email-accounts', pick: firstId },
  variantId: { path: '/admin/inventory', pick: firstId },
  stockCountId: { path: '/admin/inventory/counts', pick: firstId },
  orderId: { path: '/admin/orders', pick: firstId },
  purchaseOrderId: { path: '/admin/purchase-orders', pick: firstId },
  bookingId: { path: '/admin/stitching/bookings', pick: firstId },
  jobId: { path: '/admin/stitching/jobs', pick: firstId },
  supplierId: { path: '/admin/suppliers', pick: firstId },
  tradingPartnerId: { path: '/admin/trading-partners', pick: firstId },
  userId: { path: '/admin/users', pick: firstId },
  brandId: { path: '/organization/me/scope', pick: (json) => firstOf(json?.brands)?.id },
  branchId: { path: '/organization/me/scope', pick: (json) => firstOf(json?.nodes)?.id },
  orgId: { path: '/organization/me/scope', pick: (json) => firstOf(json?.nodes)?.orgId ?? firstOf(json?.brands)?.orgId },
};

/** A list response is `{data: [...]}`, `{data:{...}}`, or a bare array — accept all three. */
function firstOf(value) {
  if (Array.isArray(value)) return value[0];
  if (value && Array.isArray(value.data)) return value.data[0];
  return undefined;
}
function firstId(json) {
  return firstOf(json)?.id;
}

/** Every web/pos route needing an entity id, mapped to which fixture(s) it needs and its auth. */
const ROUTE_FIXTURES = [
  { url: '/admin/products/[id]', params: { id: 'productId' } },
  { url: '/admin/designs/[id]', params: { id: 'optionGroupId' } },
  { url: '/admin/garments/[id]', params: { id: 'garmentTypeId' } },
  { url: '/admin/email-accounts/[id]', params: { id: 'emailAccountId' } },
  { url: '/admin/inventory/[variantId]/chain', params: { variantId: 'variantId' } },
  { url: '/admin/inventory/counts/[id]', params: { id: 'stockCountId' } },
  { url: '/admin/orders/[id]', params: { id: 'orderId' } },
  { url: '/admin/purchase-orders/[id]', params: { id: 'purchaseOrderId' } },
  { url: '/admin/purchase-orders/[id]/receive', params: { id: 'purchaseOrderId' } },
  { url: '/admin/stitching/bookings/[id]', params: { id: 'bookingId' } },
  { url: '/admin/stitching/jobs/[id]', params: { id: 'jobId' } },
  { url: '/admin/suppliers/[id]', params: { id: 'supplierId' } },
  { url: '/admin/trading-partners/[id]', params: { id: 'tradingPartnerId' } },
  { url: '/admin/users/[id]', params: { id: 'userId' } },
  { url: '/admin/b/[brandId]', params: { brandId: 'brandId' } },
  { url: '/admin/br/[branchId]', params: { branchId: 'branchId' } },
  { url: '/admin/o/[orgId]', params: { orgId: 'orgId' } },
  { url: '/admin/o/[orgId]/access', params: { orgId: 'orgId' } },
  { url: '/[locale]/product/[slug]', params: { slug: 'productSlug' } },
];

/* ── which auth (if any) each family of routes needs ────────────────────── */

const AUTH = { NONE: 'none', ADMIN: 'admin', CUSTOMER: 'customer', POS_FRESH: 'pos-fresh', POS_SHIFT: 'pos-shift' };

function authFor(app, url) {
  if (app === 'web') {
    if (url === '/admin/login') return AUTH.NONE;
    if (url.startsWith('/admin/')) return AUTH.ADMIN;
    if (/^\/\[locale\]\/(account|orders|wishlist)/.test(url)) return AUTH.CUSTOMER;
    return AUTH.NONE; // every other storefront page is public
  }
  if (app === 'pos') {
    if (url === '/login' || url === '/') return AUTH.NONE;
    if (['/till', '/returns', '/shift/close'].includes(url)) return AUTH.POS_SHIFT;
    return AUTH.POS_FRESH; // /terminal, /shift/open — signed in, nothing selected yet
  }
  return AUTH.NONE;
}

/* ── building the concrete route list ────────────────────────────────────── */

/**
 * Static + locale-only + fixture-resolved routes, as concrete `{url, app,
 * auth, source}` targets. Dynamic routes with no fixture entry, or whose
 * fixture resolved to undefined, come back separately as `skipped`.
 *
 * `[locale]` is expanded to every locale the brand ships (`BRAND.locale
 * .locales`) rather than English only, because RTL is exactly the kind of
 * difference an overflow check exists to catch and chapter 07 already
 * records it as under-tested. Admin is excluded from that expansion — it is
 * English-only by construction, restated in half this codebase's own
 * comments, so testing it in `ur` would test a locale it never serves.
 */
async function buildTargets(adminFetch) {
  const targets = [];
  const skipped = [];

  for (const app of ['web', 'pos']) {
    for (const route of routeInventory(APPS.find((a) => a.name === app))) {
      const url = route.url;
      if (/\[/.test(url)) continue; // handled below, per fixture entry
      const withLocale = url.includes('[locale]');
      const expanded = withLocale ? LOCALES.map((l) => url.replace('[locale]', l)) : [url];
      for (const concrete of expanded) targets.push({ app, url: concrete, template: url, auth: authFor(app, url), file: route.file });
    }
  }

  for (const entry of ROUTE_FIXTURES) {
    const app = entry.url.startsWith('/[locale]') || entry.url.startsWith('/admin') || entry.url === '/admin' ? 'web' : 'pos';
    const values = {};
    let ok = true;
    for (const [param, sourceKey] of Object.entries(entry.params)) {
      const source = FIXTURE_SOURCES[sourceKey];
      let value;
      try {
        value = source.pick(await adminFetch(source.path));
      } catch (error) {
        value = undefined;
      }
      if (value === undefined) {
        ok = false;
        skipped.push({ app, url: entry.url, reason: `no fixture for [${param}] — ${source.path} returned nothing to resolve it from` });
        break;
      }
      values[param] = value;
    }
    if (!ok) continue;

    let concrete = entry.url.replace(/\[([a-zA-Z]+)\]/g, (_, p) => values[p]);
    const withLocale = concrete.includes('[locale]');
    const expanded = withLocale ? LOCALES.map((l) => concrete.replace('[locale]', l)) : [concrete];
    for (const url of expanded) targets.push({ app, url, template: entry.url, auth: authFor(app, entry.url.replace(/\[[a-zA-Z]+\]/g, 'x')), file: entry.url });
  }

  // /receipt/[orderId] and /[locale]/orders/[number] are resolved in main(),
  // from the sale and the customer's own order history — not here, since
  // both need state this function does not have. Nothing is pushed to
  // `skipped` for them now; main() reports each as resolved or skipped
  // once it actually knows which, so a route is never reported both ways.
  skipped.push({
    app: 'web',
    url: '/[locale]/stitching/[number]',
    reason: 'no "my bookings" endpoint exists for a signed-in customer to resolve one from — see the file header',
  });

  return { targets, skipped };
}

/* ── self-test: the math, with no server ─────────────────────────────────── */

async function selfTest() {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
  let failed = 0;
  let total = 0;
  const check = (ok, what) => {
    total += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
    if (!ok) failed += 1;
  };

  await page.setContent('<html><body style="margin:0"><div style="width:300px">fits</div></body></html>');
  check((await measureOverflow(page)).overflowPx === 0, 'no overflow when content fits');

  await page.setContent('<html><body style="margin:0"><div class="sku-code x y z w" style="width:900px">SKU-0001-XL-RED-99</div></body></html>');
  const wide = await measureOverflow(page);
  check(wide.overflowPx === 500, `overflow measured correctly (${wide.overflowPx}px, expected 500)`);
  check(wide.culprit?.selector === 'div.sku-code.x.y', `culprit selector found and capped at 3 classes (got "${wide.culprit?.selector}")`);
  check(wide.culprit?.text === 'SKU-0001-XL-RED-99', 'culprit text captured');

  await page.setContent('<html><body style="margin:0"><div style="width:399.6px">sub-pixel</div></body></html>');
  check((await measureOverflow(page)).overflowPx === 0, 'sub-pixel rounding does not false-positive (399.6px in a 400px viewport)');

  await page.setContent('<html><body style="margin:0"><div style="width:2000px;display:none">hidden, should not count</div><div style="width:100px">visible</div></body></html>');
  check((await measureOverflow(page)).overflowPx === 0, 'a display:none culprit is not reported — it cannot actually be seen overflowing');

  // The real bug this file's first live run found: a table properly
  // contained by its own overflow-x-auto scroll region must not be reported
  // as the page's culprit, even though its own unclipped rect is huge — and
  // a genuine leak elsewhere on the same page must still be caught.
  await page.setContent(`<html><body style="margin:0">
    <div style="width:900px;background:blue;height:10px" id="real-leak"></div>
    <div style="overflow-x:auto;width:300px">
      <table style="width:900px;height:10px"><tr><td>contained, not a leak</td></tr></table>
    </div>
  </body></html>`);
  const contained = await measureOverflow(page);
  check(contained.overflowPx > 0, 'the real leak outside the scroll region is still caught');
  check(
    contained.culprit?.selector === 'div#real-leak',
    `the table INSIDE overflow-x-auto is not blamed — the real leak is (got "${contained.culprit?.selector}")`,
  );

  // sweepWidths: one navigation, seven resizes, against a page that overflows
  // only below its own container query — proves resize-not-reload actually
  // re-measures rather than caching the first result. sweepWidths does its
  // own goto(), so the fixture has to be a real navigable URL — a `data:`
  // one — rather than content pushed in after the fact, which goto() would
  // just navigate away from.
  const html = `<html><body style="margin:0">
    <div style="width:100%;background:red;height:10px" id="probe"></div>
    <script>
      function fit() { document.getElementById('probe').style.width = (window.innerWidth < 640 ? '900px' : '100px'); }
      fit(); window.addEventListener('resize', fit);
    </script>
  </body></html>`;
  const url = `data:text/html,${encodeURIComponent(html)}`;
  const sweep = await sweepWidths(page, url, { settleMs: 50, dataSettleMs: 200 });
  check(sweep.length === 7, `sweepWidths visits all seven widths (got ${sweep.length})`);
  check(sweep.find((r) => r.width === 'xs').overflowPx > 0, 'narrow width (below 640) correctly overflows');
  check(sweep.find((r) => r.width === 'lg').overflowPx === 0, 'wide width (1024) correctly does not — proves resize is re-measuring, not caching xs');

  await browser.close();

  if (failed) {
    console.error(`\n${failed} self-test case(s) failed — the overflow measurement does not do what this file says it does.\n`);
    process.exit(1);
  }
  console.log(`\nSelf-test OK (${total} cases) — overflow detection, culprit-finding and the resize-sweep all behave as documented.`);
}

/* ── main ─────────────────────────────────────────────────────────────────── */

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  const skipBuild = process.argv.includes('--skip-build');
  const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7) || null;

  console.log('Overflow check (ITG-4) — booting the real stack...\n');

  if (!skipBuild) {
    console.log('  building api, web, pos (--skip-build to reuse an existing build)...');
    await runToCompletion('pnpm', ['--filter', '@newax/api', '--filter', '@newax/web', '--filter', '@newax/pos', 'build']);
  }
  for (const [app, dir] of [['api', 'apps/api/dist/main.js'], ['web', 'apps/web/.next'], ['pos', 'apps/pos/.next']]) {
    if (!existsSync(join(ROOT, dir))) {
      console.error(`\n${app} has no build output at ${dir}. Run \`pnpm build\` first, or drop --skip-build.\n`);
      process.exit(1);
    }
  }

  const api = spawnServer({
    label: 'api',
    cwd: join(ROOT, 'apps/api'),
    command: 'node',
    args: ['dist/main.js'],
    env: harnessEnv(),
    readyUrl: `${API_URL}/health/ready`,
  });
  const web = spawnServer({
    label: 'web',
    cwd: join(ROOT, 'apps/web'),
    command: 'pnpm',
    args: ['start', '--port', String(PORTS.web)],
    env: harnessEnv(),
    readyUrl: WEB_URL,
  });
  const pos = spawnServer({
    label: 'pos',
    cwd: join(ROOT, 'apps/pos'),
    command: 'pnpm',
    args: ['start', '--port', String(PORTS.pos)],
    env: harnessEnv(),
    readyUrl: POS_URL,
  });

  let browser;
  try {
    await api.ready;
    console.log('  api ready');
    await Promise.all([web.ready, pos.ready]);
    console.log('  web and pos ready\n');

    console.log('  signing in (admin, customer, POS operator)...');
    const adminAuth = await login(API_URL, ADMIN.identifier, ADMIN.password);
    const customerAuth = await login(API_URL, CUSTOMER.identifier, CUSTOMER.password);
    const adminFetch = (path) =>
      fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${adminAuth.accessToken}` } }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`${path} → HTTP ${r.status}`)),
      );

    console.log('  setting up a POS terminal and shift...');
    const { terminal, shift, saleOrderId } = await setUpPos(adminFetch, adminAuth.accessToken);
    console.log(`  ready: terminal ${terminal.code}, shift open, one sale rung up${saleOrderId ? '' : ' (no sample sale — see above)'}\n`);

    console.log('  resolving fixtures for dynamic routes...');
    const { targets: fixtureTargets, skipped } = await buildTargets(adminFetch);
    let targets = fixtureTargets;
    if (saleOrderId) {
      targets.push({ app: 'pos', url: `/receipt/${saleOrderId}`, template: '/receipt/[orderId]', auth: AUTH.POS_SHIFT, file: '/receipt/[orderId]' });
    } else {
      skipped.push({ app: 'pos', url: '/receipt/[orderId]', reason: 'the sample sale this run tried to make did not go through — see the setup log above' });
    }
    const myOrder = await fetchCustomerOrderNumber(customerAuth.accessToken);
    if (myOrder) for (const l of LOCALES) targets.push({ app: 'web', url: `/${l}/orders/${myOrder}`, template: '/[locale]/orders/[number]', auth: AUTH.CUSTOMER, file: '/[locale]/orders/[number]' });
    else skipped.push({ app: 'web', url: '/[locale]/orders/[number]', reason: 'the seeded customer has no orders — /orders/mine returned none' });

    if (only) targets = targets.filter((t) => t.url.includes(only));
    console.log(`  ${targets.length} concrete URL(s) to sweep, ${skipped.length} route(s) skipped (no fixture)\n`);

    browser = await launchBrowser();
    const contexts = {
      [AUTH.NONE]: await browser.newContext({ viewport: { width: WIDTHS[0].width, height: 900 } }),
      [AUTH.ADMIN]: await authedContext(browser, { origin: WEB_URL, storageEntries: toEntries(WEB_ADMIN_KEYS, adminAuth) }),
      [AUTH.CUSTOMER]: await authedContext(browser, { origin: WEB_URL, storageEntries: toEntries(WEB_CUSTOMER_KEYS, customerAuth) }),
      [AUTH.POS_FRESH]: await authedContext(browser, {
        origin: POS_URL,
        storageEntries: { [POS_KEYS.access]: adminAuth.accessToken, [POS_KEYS.refresh]: adminAuth.refreshToken, [POS_KEYS.user]: JSON.stringify(adminAuth.user) },
      }),
      [AUTH.POS_SHIFT]: await authedContext(browser, {
        origin: POS_URL,
        storageEntries: {
          [POS_KEYS.access]: adminAuth.accessToken,
          [POS_KEYS.refresh]: adminAuth.refreshToken,
          [POS_KEYS.user]: JSON.stringify(adminAuth.user),
          [POS_KEYS.terminalId]: terminal.id,
          [POS_KEYS.shiftId]: shift.id,
        },
      }),
    };

    console.log('  sweeping...\n');
    const results = await runPool(targets, CONCURRENCY, async (target) => {
      const base = target.app === 'web' ? WEB_URL : POS_URL;
      const context = contexts[target.auth];
      const page = await context.newPage();
      try {
        const sweep = await sweepWidths(page, `${base}${target.url}`, { navTimeoutMs: NAV_TIMEOUT_MS });
        return { ...target, sweep };
      } catch (error) {
        return { ...target, error: error.message };
      } finally {
        await page.close();
      }
    });

    report(results, skipped);
  } finally {
    if (browser) await browser.close();
    await Promise.all([api.stop(), web.stop(), pos.stop()]);
  }
}

/* ── setup helpers ────────────────────────────────────────────────────────── */

function harnessEnv() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY,
    NODE_ROLE: 'STANDALONE',
    NODE_ID: 'main',
    API_PORT: String(PORTS.api),
    API_PREFIX: 'api',
    CORS_ORIGINS: `${WEB_URL},${POS_URL}`,
    // Every togglable module on except identity-verification, which needs
    // external NID_* credentials this harness does not have — an absent
    // module renders as an absent-module state (MOD-1), not a crash, so
    // leaving it off costs this run nothing it could not otherwise cover.
    // Overridable, like SEED_ADMIN_* above, so CI can restate exactly what
    // it is testing rather than trusting a literal buried in this file.
    MODULES:
      process.env.MODULES ||
      'catalog,measurements,cart,orders,payments,stitching,inventory,purchasing,production,parties,tradingpartners,crm,marketing,analytics,reports,tax,tracking,organization,accounting,pos,transfers',
    PAYMENT_PROVIDERS: 'cod,bank_transfer',
    NOTIFICATION_CHANNELS: 'log',
    STORAGE_DRIVER: 'local',
    LOCAL_STORAGE_DIR: './uploads',
    LOCAL_STORAGE_PUBLIC_URL: `${API_URL}/files`,
    SEED_ADMIN_EMAIL: ADMIN.identifier,
    SEED_ADMIN_PASSWORD: ADMIN.password,
    NEXT_PUBLIC_API_URL: API_URL,
    NEXT_PUBLIC_SITE_URL: WEB_URL,
    STOREFRONT_URL: WEB_URL,
    PORT: undefined, // let each `next start --port` argument decide, not a stray inherited PORT
  };
}

/** Register a terminal, open a shift, ring up one sale — real API calls, real rows. */
async function setUpPos(adminFetch, accessToken) {
  const post = (path, body) =>
    fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`${path} → HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
      return r.json();
    });

  const locations = await adminFetch('/admin/inventory/locations');
  const locationId = firstOf(locations)?.id;
  if (!locationId) throw new Error('no seeded Location to register a POS terminal at — is the database seeded?');

  // A short, realistic code — RegisterPosTerminalDto's own example is
  // "LHR-01-T1" — not a timestamp. A first run of this check used
  // `Date.now()` for uniqueness and got a 30-character code, which then
  // reported /terminal as overflowing at 280px: a bug in this fixture, not
  // in the product. `code` has no max-length validation server-side, so a
  // genuinely long one is a separate, real gap this check surfaces but does
  // not fix — see the note where this constant is used, below.
  const code = `OVFL-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const registered = await post('/admin/pos/terminals', { code, label: 'Overflow check terminal', locationId });
  // Registered terminals start PENDING (RETAIL-ERP.md R7/R11's device-trust
  // boundary) — real till onboarding activates one after issuing its device
  // key, which this harness has no device to do, so it activates directly.
  const terminal = await fetch(`${API_URL}/admin/pos/terminals/${registered.id}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'ACTIVE' }),
  }).then((r) => r.json());
  const shift = await post('/admin/pos/shifts/open', { terminalId: terminal.id, openingCashMinor: 500000 });

  // The search endpoint deliberately returns nothing for an empty term (it
  // is "type to search", not "list everything") — so it needs a real term.
  // The inventory list already has one: a variant's own SKU.
  const inventory = await adminFetch('/admin/inventory');
  const sampleSku = firstOf(inventory)?.sku;
  const catalog = sampleSku
    ? await fetch(`${API_URL}/admin/pos/products/search?terminalId=${terminal.id}&q=${encodeURIComponent(sampleSku)}`, {
        headers: { authorization: `Bearer ${accessToken}` },
      }).then((r) => (r.ok ? r.json() : null))
    : null;
  const variant = firstOf(catalog);
  let saleOrderId = null;
  if (variant?.variantId) {
    try {
      // { lines: [{variantId, quantity}] } is the whole DTO — price and
      // payment are resolved server-side, never sent by the till (a cashier
      // cannot type a price the stock system disagrees with).
      const sale = await post(`/admin/pos/shifts/${shift.id}/sales`, {
        lines: [{ variantId: variant.variantId, quantity: 1 }],
      });
      saleOrderId = sale.id ?? sale.orderId ?? null;
    } catch (error) {
      console.log(`  (no sample sale — ${error.message.slice(0, 200)}; /receipt/[orderId] will be reported skipped)`);
      saleOrderId = null;
    }
  }
  return { terminal, shift, saleOrderId };
}

async function fetchCustomerOrderNumber(accessToken) {
  const res = await fetch(`${API_URL}/orders/mine`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const json = await res.json();
  return firstOf(json)?.number ?? null;
}

function toEntries(keys, auth) {
  return { [keys.access]: auth.accessToken, [keys.refresh]: auth.refreshToken, [keys.user]: JSON.stringify(auth.user) };
}

async function runToCompletion(command, args) {
  const { spawn } = await import('node:child_process');
  await new Promise((res, rej) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${command} ${args.join(' ')} exited ${code}`))));
  });
}

/** A tiny concurrency-limited map — no dependency for something this small. */
async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runOne));
  return results;
}

/* ── reporting ─────────────────────────────────────────────────────────────── */

function report(results, skipped) {
  const failures = [];
  const errors = [];
  for (const r of results) {
    if (r.error) {
      errors.push(r);
      continue;
    }
    for (const width of r.sweep) if (width.overflowPx > 0) failures.push({ ...r, width });
  }

  console.log(`Swept ${results.length} route(s) × ${WIDTHS.length} widths (${results.length * WIDTHS.length} measurements).\n`);

  if (skipped.length) {
    console.log(`Skipped (no fixture) — ${skipped.length}:`);
    for (const s of skipped) console.log(`  ${s.app} ${s.url}\n    ${s.reason}`);
    console.log('');
  }

  if (errors.length) {
    console.log(`Failed to load — ${errors.length}:`);
    for (const e of errors) console.log(`  ${e.app} ${e.url} (${e.auth})\n    ${e.error}`);
    console.log('');
  }

  if (!failures.length && !errors.length) {
    console.log('Overflow OK — no route overflows at any of the seven widths.');
    return;
  }

  if (failures.length) {
    console.error(`ITG-4 violations — ${failures.length} route×width overflow(s):\n`);
    const byRoute = new Map();
    for (const f of failures) {
      const key = `${f.app} ${f.url}`;
      if (!byRoute.has(key)) byRoute.set(key, []);
      byRoute.get(key).push(f.width);
    }
    for (const [route, widths] of byRoute) {
      console.error(`  ${route}`);
      for (const w of widths) {
        const culprit = w.culprit ? `${w.culprit.selector} "${w.culprit.text}"` : 'no single element found (check for a wide unbreakable string)';
        console.error(`    ${w.width} (${w.px}px): overflows by ${w.overflowPx}px — ${culprit}`);
      }
    }
    console.error(
      '\nLaw 4: none of the seven widths may waste space or overflow it. The usual\n' +
        'causes: a fixed pixel width, an unbreakable string (a SKU, an IBAN, a long\n' +
        'email), a table with no scroll container, or min-width on a grid child.\n' +
        'See docs/design/process-governance/15-integrity.md ITG-4 and docs/design/layout-composition/02-layout.md.\n',
    );
  }
  process.exit(1);
}

main().catch((error) => {
  console.error(`\ncheck-overflow.mjs failed to run: ${error.stack || error.message}\n`);
  process.exit(1);
});

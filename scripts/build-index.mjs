#!/usr/bin/env node
/**
 * Builds the repository index under docs/index/.
 *
 * WHY THIS EXISTS. This repository is ~880 tracked files and ~115k lines
 * across four applications, three packages, 26 API feature modules and 22
 * Prisma schema files. An agent that opens a session here and starts grepping
 * spends most of its budget rediscovering the shape of the codebase before it
 * can touch the actual task — every session, from zero. The index is that
 * discovery, done once, checked in, and kept true by a pre-commit hook.
 *
 * WHAT IT GUARANTEES. Every file git tracks appears somewhere in the index,
 * and the index is derived entirely from the code — nothing here is typed by
 * hand, so it cannot drift into lying. `--check` fails when the committed
 * index no longer matches the working tree, which is what CI and the git hook
 * use to make that guarantee mechanical rather than aspirational.
 *
 * WHAT IT IS NOT. It is not documentation and it does not replace
 * docs/implementation/ — those explain WHY the system is shaped as it is, and
 * a generator cannot write them. The index answers WHERE something is, which
 * is a different question and the one that is expensive to answer by reading.
 *
 *   node scripts/build-index.mjs           write the index
 *   node scripts/build-index.mjs --check   exit 1 if stale (CI, hooks)
 *   node scripts/build-index.mjs --quiet   write, print nothing but errors
 *
 * See docs/index/README.md for the reader's side of this.
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, statSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname, basename, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readText, trackedFiles, fileDoc, docAbove, clip, cell,
  scanSymbols, scanReExports, scanImports,
  scanController, accessOf, scanNestModule,
  scanEventCatalog, scanEventUsage, scanCron, scanStateMachines,
  scanPrisma, scanMigration, scanMigrationSql, schemaMigrationDrift,
  scanPermissionCatalog, scanRoleSeed,
  appRouterPath, routeKind, isClientComponent,
  scanDescribes, scanTestNames, scanHeadings, classify,
} from './lib/index-scan.mjs';
import { ROUTING_POLICY, ADVISORY_SIGNALS, cacheTtlFor } from './lib/model-routing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const OUT_DIR = join(ROOT, 'docs', 'index');
const CHECK = process.argv.includes('--check');
const QUIET = process.argv.includes('--quiet') || CHECK;

const log = (...a) => { if (!QUIET) console.log(...a); };

/* ════════════════════════════════════════════════════════════════════════
   1. COLLECT
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Which top-level area a path belongs to.
 *
 * The areas are the four deployables, the shared packages, the documents and
 * the operational surface — the same division a person already carries in
 * their head when they ask "where does this live".
 */
function areaOf(rel) {
  if (rel.startsWith('apps/api/')) return 'api';
  if (rel.startsWith('apps/web/')) return 'web';
  if (rel.startsWith('apps/pos/')) return 'pos';
  if (rel.startsWith('apps/mobile/')) return 'mobile';
  if (rel.startsWith('packages/')) return 'packages';
  if (rel.startsWith('docs/')) return 'docs';
  if (rel.startsWith('scripts/') || rel.startsWith('.github/') || rel.startsWith('deploy/')) return 'infra';
  if (/^(docker|Caddyfile|cloudflare|wrangler|turbo|pnpm|package\.json|\.env|\.dockerignore|\.gitignore)/.test(rel)) return 'infra';
  return 'root';
}

const AREA_LABEL = {
  api: 'apps/api — NestJS API, the only writer of business state',
  web: 'apps/web — Next.js admin console and customer storefront',
  pos: 'apps/pos — Next.js offline-first point of sale',
  mobile: 'apps/mobile — Expo/React Native customer app',
  packages: 'packages/* — code shared across every surface',
  docs: 'docs/* — the documents of record',
  infra: 'scripts, CI, deployment and container configuration',
  root: 'repository root files',
};

const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.prisma', '.sql', '.css', '.yml', '.yaml', '.toml', '.sh', '.example']);

/**
 * The index never indexes itself.
 *
 * Once `docs/index/` is committed it becomes tracked like any other content,
 * and without this the generator's next run would list its own ~100 pages in
 * the file ledger, the doc outlines and the totals — a feedback loop whose
 * output grows every commit and whose "141k lines" stops meaning the code.
 * `MANIFEST.json` records what the index contains; the index itself is not
 * part of what it describes.
 */
const SELF = 'docs/index/';

log('Scanning…');
const files = trackedFiles(ROOT).filter((f) => !f.startsWith(SELF));

/** The one record per file that everything else is built from. */
const records = [];
for (const rel of files) {
  const abs = join(ROOT, rel);
  let size = 0;
  try { size = statSync(abs).size; } catch { /* a file staged as deleted */ }
  const ext = extname(rel);
  const textual = TEXT_EXT.has(ext) || /Dockerfile|Caddyfile|\.gitignore$/.test(basename(rel));
  const source = textual ? readText(ROOT, rel) : '';
  records.push({
    rel,
    area: areaOf(rel),
    dir: dirname(rel),
    base: basename(rel),
    ext,
    bytes: size,
    lines: source ? source.split('\n').length : 0,
    kind: classify(rel),
    doc: source && /\.(ts|tsx|mjs|js|prisma)$/.test(ext) ? fileDoc(source) : '',
    source,
  });
}
const byPath = new Map(records.map((r) => [r.rel, r]));
const isTs = (r) => r.ext === '.ts' || r.ext === '.tsx';
const isSpec = (r) => /\.(spec|e2e-spec)\.tsx?$/.test(r.base);

log(`  ${records.length} tracked files`);

/* ── symbols on every TypeScript file ──────────────────────────────────── */

for (const r of records) {
  if (!isTs(r) && r.ext !== '.mjs') continue;
  r.symbols = scanSymbols(r.source);
  r.reExports = scanReExports(r.source);
  r.imports = scanImports(r.source);
  if (r.ext === '.tsx') r.client = isClientComponent(r.source);
}

/* ── the API's own structure ───────────────────────────────────────────── */

const apiModuleOf = (rel) => (rel.match(/^apps\/api\/src\/modules\/([^/]+)\//) ?? [])[1] ?? null;
const apiCoreOf = (rel) => (rel.match(/^apps\/api\/src\/core\/([^/]+)\//) ?? [])[1] ?? null;

const controllers = [];
const nestModules = [];
const crons = [];
const eventSubscribers = [];
const eventReferences = [];
const stateMachines = [];

for (const r of records) {
  if (!r.rel.startsWith('apps/api/src/') || !isTs(r) || isSpec(r)) continue;
  if (/@Controller\(/.test(r.source)) controllers.push(...scanController(r.source, r.rel));
  if (/@Module\(/.test(r.source)) {
    const m = scanNestModule(r.source, r.rel);
    if (m) nestModules.push(m);
  }
  if (/@Cron\(/.test(r.source)) crons.push(...scanCron(r.source, r.rel));
  if (/Record<\s*\w+\s*,\s*\w+\[\]\s*>/.test(r.source)) stateMachines.push(...scanStateMachines(r.source, r.rel));
  if (/DomainEvent\./.test(r.source)) {
    const { subscribes, references } = scanEventUsage(r.source, r.rel);
    eventSubscribers.push(...subscribes);
    eventReferences.push(...references);
  }
}

const allRoutes = controllers.flatMap((c) =>
  c.routes.map((rt) => ({
    ...rt,
    controller: c.class,
    file: c.file,
    module: apiModuleOf(c.file) ?? (apiCoreOf(c.file) ? `core/${apiCoreOf(c.file)}` : 'app'),
    access: accessOf(rt),
  })),
).sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

/* ── domain events ─────────────────────────────────────────────────────── */

const eventCatalog = scanEventCatalog(readText(ROOT, 'apps/api/src/core/events/domain-events.ts'));
const subscribersBySymbol = new Map();
for (const s of eventSubscribers) {
  if (!subscribersBySymbol.has(s.symbol)) subscribersBySymbol.set(s.symbol, []);
  subscribersBySymbol.get(s.symbol).push(s);
}
const subscriberSites = new Set(eventSubscribers.map((s) => `${s.file}:${s.line}`));
const publishersBySymbol = new Map();
for (const ref of eventReferences) {
  if (subscriberSites.has(`${ref.file}:${ref.line}`)) continue;
  if (ref.file.endsWith('core/events/domain-events.ts')) continue;
  if (!publishersBySymbol.has(ref.symbol)) publishersBySymbol.set(ref.symbol, []);
  publishersBySymbol.get(ref.symbol).push(ref);
}

/* ── data model ────────────────────────────────────────────────────────── */

const prismaModels = [];
const prismaEnums = [];
for (const r of records) {
  if (r.ext !== '.prisma') continue;
  const { models, enums } = scanPrisma(r.source, r.rel);
  prismaModels.push(...models);
  prismaEnums.push(...enums);
}
prismaModels.sort((a, b) => a.name.localeCompare(b.name));
prismaEnums.sort((a, b) => a.name.localeCompare(b.name));

const migrationRecords = records
  .filter((r) => r.base === 'migration.sql')
  .sort((a, b) => a.rel.localeCompare(b.rel));
const migrations = migrationRecords
  .map((r) => scanMigration(ROOT, r.rel))
  .sort((a, b) => a.folder.localeCompare(b.folder));

/**
 * What the committed migrations actually build, versus what the schema
 * declares. See `schemaMigrationDrift` for why this is worth stating.
 */
const built = scanMigrationSql(
  [...migrationRecords].sort((a, b) => basename(dirname(a.rel)).localeCompare(basename(dirname(b.rel)))).map((r) => r.source),
);
const drift = schemaMigrationDrift(prismaModels, prismaEnums, built);

/* ── permissions ───────────────────────────────────────────────────────── */

const permissionSource = readText(ROOT, 'packages/shared/src/permissions.ts');
const permissionCatalog = scanPermissionCatalog(permissionSource);
const roleSeed = scanRoleSeed(permissionSource);
/** Which seeded roles grant a given key — the "can a live user hold this" answer. */
const rolesGranting = (key) => Object.entries(roleSeed).filter(([, keys]) => keys.includes(key)).map(([role]) => role);
const permissionUse = new Map(permissionCatalog.map((p) => [p.key, { api: [], web: [], seed: [] }]));
const ensurePerm = (key) => {
  if (!permissionUse.has(key)) permissionUse.set(key, { api: [], web: [], seed: [], undeclared: true });
  return permissionUse.get(key);
};
for (const rt of allRoutes) {
  for (const key of rt.permissions) ensurePerm(key).api.push(rt);
}
for (const r of records) {
  if (!isTs(r) || isSpec(r)) continue;
  if (!r.rel.startsWith('apps/web/') && !r.rel.startsWith('apps/pos/')) continue;
  r.source.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/['"]([a-z_]+(?:\.[a-z_]+)+)['"]/g)) {
      if (permissionUse.has(m[1])) permissionUse.get(m[1]).web.push({ file: r.rel, line: i + 1 });
    }
  });
}
{
  const seed = readText(ROOT, 'apps/api/prisma/seed.ts');
  seed.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/['"]([a-z_]+(?:\.[a-z_]+)+)['"]/g)) {
      if (permissionUse.has(m[1])) permissionUse.get(m[1]).seed.push({ line: i + 1 });
    }
  });
}

/* ── the module registries, read from their own source ─────────────────── */

function parseModulePacks() {
  const src = readText(ROOT, 'apps/api/src/modules/module-packs.ts');
  const block = src.match(/export const MODULE_PACKS[^=]*=\s*\{([\s\S]*?)\n\};/);
  const out = {};
  if (!block) return out;
  for (const m of block[1].matchAll(/^\s*'?([\w-]+)'?\s*:\s*'([\w-]+)'/gm)) out[m[1]] = m[2];
  return out;
}

function parseFeatureModules() {
  const src = readText(ROOT, 'apps/api/src/modules/modules.registry.ts');
  const block = src.match(/export const FEATURE_MODULES[^=]*=\s*\[([\s\S]*?)\n\];/);
  const out = [];
  if (!block) return out;
  const lines = block[1].split('\n');
  lines.forEach((line, i) => {
    const m = line.match(/\{\s*name:\s*'([^']+)'\s*,\s*module:\s*(\w+)\s*(?:,\s*alwaysOn:\s*(true|false))?/);
    if (m) out.push({ name: m[1], module: m[2], alwaysOn: m[3] === 'true', note: docAbove(lines, i) });
  });
  return out;
}

const modulePacks = parseModulePacks();
const featureModules = parseFeatureModules();
const featureByName = new Map(featureModules.map((f) => [f.name, f]));

/* ── front-end routes, nav and components ──────────────────────────────── */

const APP_DIRS = {
  web: 'apps/web/src/app',
  pos: 'apps/pos/src/app',
};
const uiRoutes = [];
for (const [app, prefix] of Object.entries(APP_DIRS)) {
  for (const r of records) {
    if (!r.rel.startsWith(`${prefix}/`)) continue;
    const kind = routeKind(r.rel);
    if (!kind) continue;
    uiRoutes.push({
      app,
      kind,
      url: appRouterPath(r.rel, prefix),
      file: r.rel,
      client: !!r.client,
      surface: r.rel.includes('(admin)') ? 'admin' : r.rel.includes('(storefront)') ? 'storefront' : app,
      doc: r.doc,
    });
  }
}
// Expo router uses the same file convention under apps/mobile/app.
for (const r of records) {
  if (!r.rel.startsWith('apps/mobile/app/')) continue;
  if (!/\.tsx?$/.test(r.base) || r.base.startsWith('_')) continue;
  uiRoutes.push({
    app: 'mobile',
    kind: 'screen',
    url: appRouterPath(`${r.rel.replace(/\.tsx?$/, '')}/x`, 'apps/mobile/app'),
    file: r.rel,
    client: true,
    surface: 'mobile',
    doc: r.doc,
  });
}
uiRoutes.sort((a, b) => a.app.localeCompare(b.app) || a.url.localeCompare(b.url) || a.kind.localeCompare(b.kind));

function parseNavRegistry() {
  const src = readText(ROOT, 'apps/web/src/components/admin/nav-registry.ts');
  const out = [];
  for (const m of src.matchAll(
    /\{\s*key:\s*'([^']+)'\s*,\s*label:\s*'([^']*)'\s*,\s*href:\s*([^,]+),\s*group:\s*'([^']*)'([\s\S]{0,320}?)\n\s*\}/g,
  )) {
    const tail = m[5];
    const perm = tail.match(/permission:\s*'([^']+)'/);
    const mod = tail.match(/module:\s*'([^']+)'/);
    out.push({
      key: m[1], label: m[2], href: m[3].trim(), group: m[4],
      permission: perm ? perm[1] : '', module: mod ? mod[1] : '',
    });
  }
  return out;
}
const navItems = parseNavRegistry();

/* ── workspace commands ────────────────────────────────────────────────── */

const workspaceScripts = [];
for (const r of records) {
  if (r.base !== 'package.json') continue;
  try {
    const pkg = JSON.parse(r.source);
    for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
      workspaceScripts.push({ pkg: pkg.name ?? r.rel, file: r.rel, name, cmd });
    }
  } catch { /* a package.json that does not parse is its own bug, not this one's */ }
}

/* ── tests ─────────────────────────────────────────────────────────────── */

const testFiles = records
  .filter((r) => isSpec(r))
  .map((r) => ({
    file: r.rel,
    area: r.area,
    module: apiModuleOf(r.rel) ?? (apiCoreOf(r.rel) ? `core/${apiCoreOf(r.rel)}` : ''),
    kind: r.kind,
    lines: r.lines,
    describes: scanDescribes(r.source),
    cases: scanTestNames(r.source).length,
  }));

log(`  ${allRoutes.length} HTTP routes · ${prismaModels.length} models · ${eventCatalog.length} events · ${uiRoutes.length} screens`);

/* ════════════════════════════════════════════════════════════════════════
   2. RENDER
   ════════════════════════════════════════════════════════════════════════ */

const written = new Map();
function emit(relPath, body) {
  const text = `${body.replace(/\s+$/, '')}\n`;
  written.set(relPath, text);
}

function table(headers, rows) {
  if (rows.length === 0) return '_none_\n';
  const head = `| ${headers.join(' | ')} |`;
  const rule = `|${headers.map(() => '---').join('|')}|`;
  const body = rows.map((r) => `| ${r.map(cell).join(' | ')} |`).join('\n');
  return `${head}\n${rule}\n${body}\n`;
}

const fmt = (n) => n.toLocaleString('en-US');

/**
 * Roughly what a page costs to put in a context window.
 *
 * ~3.7 bytes per token is a serviceable approximation for English prose and
 * markdown tables; it is here to separate a 500-token page from a 12,000-token
 * one, not to be exact. The point is that `cross/files.md` and `cross/jobs.md`
 * look identical in a link list while costing twenty times differently, and a
 * reader deciding what to open deserves to know which is which.
 */
const tokens = (text) => Math.round(Buffer.byteLength(text, 'utf8') / 3.7);

/**
 * A placeholder resolved after every page exists.
 *
 * The README is written first but measures pages written later, so asking for
 * a size at emit time reports nothing — which is how the cost column shipped
 * blank the first time. Emitting a marker and substituting it in a final pass
 * makes the answer independent of the order pages happen to be generated in.
 */
const cost = (page) => `{{COST:${page}}}`;

function resolveCostMarkers() {
  const sizeOf = (page) => {
    const body = written.get(page);
    if (!body) return 'n/a';
    const t = tokens(body);
    return t >= 1000 ? `~${(t / 1000).toFixed(1)}k` : `~${t}`;
  };
  for (const [page, body] of written) {
    if (!body.includes('{{COST:')) continue;
    written.set(page, body.replace(/\{\{COST:([^}]+)\}\}/g, (_, target) => sizeOf(target)));
  }
}
const link = (from, to) => relative(dirname(from), to) || basename(to);
const anchor = (text) => text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');

const GENERATED = (self) =>
  `<!-- GENERATED BY scripts/build-index.mjs — DO NOT EDIT BY HAND.
     Run \`pnpm index\` to regenerate. Source of truth is the code itself. -->`;

const head = (self, title, subtitle) =>
  `${GENERATED(self)}\n\n# ${title}\n\n${subtitle}\n`;

const BACK = (self) => `\n---\n\n[← index home](${link(self, 'docs/index/README.md')})\n`;

/* ── counts used in several places ─────────────────────────────────────── */

/** Design-system chapters, counted early because the README routes to them. */
const DESIGN_CHAPTER_RE = /^docs\/design\/\d\d-.+\.md$/;
const designChapterCount = records.filter((r) => DESIGN_CHAPTER_RE.test(r.rel)).length;

const areaStats = {};
for (const r of records) {
  const a = (areaStats[r.area] ??= { files: 0, lines: 0, bytes: 0 });
  a.files += 1; a.lines += r.lines; a.bytes += r.bytes;
}

const apiModuleNames = [...new Set(records.map((r) => apiModuleOf(r.rel)).filter(Boolean))].sort();
const apiCoreNames = [...new Set(records.map((r) => apiCoreOf(r.rel)).filter(Boolean))].sort();

const moduleFile = (name) => `docs/index/modules/${name}.md`;
const coreFile = (name) => `docs/index/core/${name}.md`;
const areaFile = (name) => `docs/index/areas/${name}.md`;

/* ── L0: README — the one file every session reads ─────────────────────── */

{
  const self = 'docs/index/README.md';
  const routing = [
    ['“Where is the endpoint for X?”', `[cross/routes.md](${link(self, 'docs/index/cross/routes.md')})`, `all ${allRoutes.length} HTTP routes, with the permission that guards each`],
    ['“What permission do I need / who has it?”', `[cross/permissions.md](${link(self, 'docs/index/cross/permissions.md')})`, `all ${permissionCatalog.length} permissions → routes, UI call sites, seed`],
    ['“Which table/column holds X?”', `[cross/data-model.md](${link(self, 'docs/index/cross/data-model.md')})`, `all ${prismaModels.length} Prisma models and ${prismaEnums.length} enums, field by field`],
    ['“How do modules talk to each other?”', `[cross/events.md](${link(self, 'docs/index/cross/events.md')})`, `all ${eventCatalog.length} domain events → publishers and subscribers`],
    ["“What are the valid status transitions for this entity?”", `[cross/state-machines.md](${link(self, 'docs/index/cross/state-machines.md')})`, `every named \`Record<XStatus, XStatus[]>\` transition table (${stateMachines.length})`],
    ['“What screen serves this URL?”', `[cross/ui-routes.md](${link(self, 'docs/index/cross/ui-routes.md')})`, `all ${uiRoutes.length} screens across web, POS and mobile`],
    ['“Is there already a component for this?”', `[cross/components.md](${link(self, 'docs/index/cross/components.md')})`, 'shared primitives and every component, with usage counts'],
    ['“How should this look / behave / read?”', `[cross/design-system.md](${link(self, 'docs/index/cross/design-system.md')})`, `the ${designChapterCount} design chapters, and the measured state of the code they govern`],
    ['“What runs on a schedule?”', `[cross/jobs.md](${link(self, 'docs/index/cross/jobs.md')})`, `${crons.length} cron jobs and the background dispatchers`],
    ['“What command do I run?”', `[cross/commands.md](${link(self, 'docs/index/cross/commands.md')})`, `every script in every package.json (${workspaceScripts.length})`],
    ['“What does the schema history look like?”', `[cross/migrations.md](${link(self, 'docs/index/cross/migrations.md')})`, `${migrations.length} migrations, newest last`],
    ['“What is already tested?”', `[cross/tests.md](${link(self, 'docs/index/cross/tests.md')})`, `${testFiles.length} spec files → what each one pins down`],
    ['“Which doc explains WHY?”', `[cross/docs.md](${link(self, 'docs/index/cross/docs.md')})`, 'every document of record, with its outline'],
    ['“What is in this one module?”', `[modules/](${link(self, 'docs/index/modules')})`, `one page per API feature module (${apiModuleNames.length})`],
    ['“What does this file export?”', `[symbols/](${link(self, 'docs/index/symbols')})`, 'every exported symbol in the repo, with line numbers'],
    ['“I need a machine-readable form.”', `[index.json](${link(self, 'docs/index/index.json')})`, 'the whole index as JSON — grep or jq it'],
  ];

  emit(self, `${head(self, 'Repository index', `A generated, multi-level map of **${fmt(records.length)} files / ${fmt(records.reduce((n, r) => n + r.lines, 0))} lines**, so that finding something costs a lookup instead of a search.`)}

## Read this first, grep second

This index exists because the repository is large enough that rediscovering its
shape — every session, from scratch — costs more than the work itself. It is
generated from the code by \`scripts/build-index.mjs\` and regenerated by a
pre-commit hook, so it is never out of date with the commit you are looking at.

**The rule:** before searching the repository for where something lives, look it
up here. Open the specific index page for your question, follow it to the two or
three files that matter, and read those. Do not read the whole repository, and
do not grep blindly through \`apps/\` for a name that this index already maps.

Come back to the code, not to this index, for *why* something is the way it is —
that is \`docs/implementation/\`, and \`CLAUDE.md\` is binding over both.

## Ask before you open

Opening a page is the second-cheapest way to use this index. The cheapest is to
query it:

\`\`\`bash
pnpm idx route POST /admin/inventory   # ~7 lines, not a 12,000-token page
pnpm idx perm inventory.manage         # routes enforcing it, UI sites, roles
pnpm idx model Order                   # fields, without opening data-model.md
pnpm idx show <file> <symbol>          # one method, not the whole file
pnpm idx where "abandoned cart"        # fuzzy, across everything
pnpm idx help                          # every command
\`\`\`

\`idx\` reads [\`index.json\`](${link(self, 'docs/index/index.json')}) — a file far too
large to open — and prints only the lines that answer the question. Reach for a
page below when you want the whole picture, not one fact.

## Where to look

Token costs are estimates, and they are the reason to prefer \`idx\` for a
single fact — the page is the right tool when you need the shape of something.

${table(['Your question', 'Open this', 'Cost', 'What it gives you'],
  routing.map((r) => {
    const m = r[1].match(/\(([^)]+)\)/);
    const rel = m ? join('docs/index', m[1].replace(/^\.\//, '')) : '';
    const page = rel.includes('<') || !/\.(md|json)$/.test(rel) ? '' : rel;
    return [r[0], r[1], page ? cost(page) : '—', r[2]];
  }))}

## The levels

| Level | Files | What it answers |
|---|---|---|
| **L0** | this file, [\`01-MAP.md\`](${link(self, 'docs/index/01-MAP.md')}) | the shape of the whole repository on one screen |
| **L1** | [\`areas/*.md\`](${link(self, 'docs/index/areas')}) | one application or package: its layout, entry points and conventions |
| **L2** | [\`modules/*.md\`](${link(self, 'docs/index/modules')}), [\`core/*.md\`](${link(self, 'docs/index/core')}) | one API module or core subsystem: files, routes, events, tables, tests |
| **L3** | [\`symbols/*.md\`](${link(self, 'docs/index/symbols')}) | one file: every export, its kind, its line number |
| **⊗** | [\`cross/*.md\`](${link(self, 'docs/index/cross')}) | one concern across all levels: routes, permissions, data, events, UI |
| **detail** | [\`data/*.md\`](${link(self, 'docs/index/data')}), [\`files/*.md\`](${link(self, 'docs/index/files')}) | full field lists per schema file, full file lists per area — split so you load one, not all |

Each level links down to the next and back up, so you can start anywhere.

## Keeping it true

\`\`\`bash
pnpm index           # regenerate
pnpm index:check     # exit 1 if the committed index is stale (CI runs this)
\`\`\`

The \`.githooks/pre-commit\` hook regenerates and stages \`docs/index/\` on every
commit, so the index ships inside the same commit as the code it describes. If
you ever see it drift, the hook is not installed — run \`pnpm install\`, or
\`node scripts/install-git-hooks.mjs\` directly.

**Never edit a file under \`docs/index/\` by hand.** The next commit overwrites
it. Fix the generator, or fix the code the generator read.

## Every agent, not just Claude

The same generator writes the file each agent tool looks for, from one shared
body, so no two of them can drift apart:

${table(['File', 'Read by'], [
  ['\`AGENTS.md\`', 'OpenAI Codex, Jules, Devin, Amp, Factory, Aider, Zed, Warp, Cursor ≥1.0'],
  ['\`.github/copilot-instructions.md\`', 'GitHub Copilot'],
  ['\`GEMINI.md\`', 'Gemini CLI, Gemini Code Assist'],
  ['\`.cursor/rules/repo-index.mdc\`', 'Cursor'],
  ['\`.windsurfrules\`', 'Windsurf / Codeium'],
  ['\`.clinerules\`', 'Cline, Roo Code'],
  ['\`.junie/guidelines.md\`', 'JetBrains Junie'],
  ['\`CLAUDE.md\`', 'Claude Code — hand-written; the contract the others point to'],
])}
Each one is a **pointer**, never a copy of the rules: they send every tool to
\`CLAUDE.md\`, which stays the single contract. They are generated and checked
like the rest of the index — edit \`AGENT_FILES\` in the generator, not the files.

Claude Code additionally runs \`.claude/hooks/session-start.sh\`, which prints
\`SESSION-BRIEF.md\` into every session and installs the git hooks.

## Coverage

${table(['Area', 'Files', 'Lines', 'L1 page'], Object.keys(AREA_LABEL)
  .filter((a) => areaStats[a])
  .map((a) => [
    AREA_LABEL[a].split(' — ')[0],
    fmt(areaStats[a].files),
    fmt(areaStats[a].lines),
    `[${a}](${link(self, areaFile(a))})`,
  ]))}
Every tracked file is accounted for: see
[\`cross/files.md\`](${link(self, 'docs/index/cross/files.md')}) for the complete
file-by-file inventory.
`);
}

/* ── Model routing: subagent definitions, the page, the advisory hook ──── */

/**
 * Turns `scripts/lib/model-routing.mjs` into the things that act on it.
 *
 * A subagent definition is the ONLY mechanism in Claude Code that selects a
 * model and an effort level per job without a human choosing: the frontmatter
 * pins both, and delegation happens automatically by matching `description`.
 * The main session's own model and effort are `/model` and `/effort`, and a
 * hook cannot set either — so the hook generated here advises and says that it
 * is advising, rather than pretending to switch something it cannot.
 */
{
  const self = 'docs/index/cross/model-routing.md';

  // ── one subagent definition per policy row
  for (const r of ROUTING_POLICY) {
    // The description is what Claude Code matches on to delegate, so it has
    // to read as a trigger rather than a title. "Use proactively" is the
    // documented way to encourage delegation for the two agents that should
    // run without being asked.
    const proactive = r.proactive ? ' Use proactively.' : '';
    const description =
      `${r.job}. Use for ${r.when}.${proactive} ` +
      `Runs on ${r.model} at ${r.effort} effort.`;
    // `experimental.cacheTtl` is only set where a longer-lived cache actually
    // pays: see CACHE TTL in scripts/lib/model-routing.mjs. Omitting it leaves
    // the 5-minute default, which a fast agent's own reads keep warm for free.
    const ttl = cacheTtlFor(r.effort);
    const front = [
      '---',
      `name: ${r.agent}`,
      `description: ${description}`,
      `model: ${r.model}`,
      `effort: ${r.effort}`,
      ...(r.tools ? [`tools: ${r.tools}`] : []),
      ...(ttl ? ['experimental:', `  cacheTtl: ${ttl}`] : []),
      '---',
    ].join('\n');

    emit(`.claude/agents/${r.agent}.md`, `${front}

<!-- GENERATED from scripts/lib/model-routing.mjs by scripts/build-index.mjs.
     DO NOT EDIT: run \`pnpm index\`. Change the policy, not this file. -->

# ${r.job}

**${r.model} · ${r.effort} effort${ttl ? ` · ${ttl} prompt cache` : ''}.** ${r.why}

${r.body.join('\n')}

---

\`CLAUDE.md\` binds you as it binds every agent here — the seven laws, the
engineering protocol and the definition of done. Look things up in
\`docs/index/\` before searching the repository; \`docs/index/README.md\` is the
routing table.

If this job turns out to belong to a different category, say so and hand it
back rather than pressing on — the routing table is in
\`docs/index/cross/model-routing.md\`.
`);
  }

  // ── the advisory hook, for the main session where nothing can auto-switch
  const cases = ADVISORY_SIGNALS.map((sig) => {
    const row = ROUTING_POLICY.find((r) => r.agent === sig.agent);
    // An unambiguous phrase fires on its own; an ordinary English word only
    // counts when a corroborating word appears with it.
    const corroborated = (sig.requires ?? [])
      .map((req) => `  if printf '%s' "$PROMPT" | grep -qiE '${req.word}' && printf '%s' "$PROMPT" | grep -qiE '${req.with}'; then MATCH=1; fi`)
      .join('\n');
    return `MATCH=0
if printf '%s' "$PROMPT" | grep -qiE '${sig.pattern}'; then MATCH=1; fi
${corroborated}
if [ "$MATCH" = "1" ]; then
  HITS="$HITS  · ${row.job} → \\\`${row.model}\\\` at \\\`${row.effort}\\\` effort (the \\\`${row.agent}\\\` subagent)
"
fi`;
  }).join('\n\n');

  emit('.claude/hooks/suggest-model.sh', `#!/bin/bash
#
# GENERATED from scripts/lib/model-routing.mjs by scripts/build-index.mjs.
# DO NOT EDIT: run \\\`pnpm index\\\`. Change the policy, not this file.
#
# UserPromptSubmit hook. Its stdout is added to the session's context, which is
# the most a hook can do here: Claude Code does not let a hook set the model or
# the effort level, so this ADVISES and says so. Work delegated to a subagent
# is where selection is genuinely automatic — see .claude/agents/ and
# docs/index/cross/model-routing.md.
#
# It is deliberately quiet, and precision beats recall: it fires only for the
# three categories where choosing wrong is expensive — access control,
# migrations and architecture. Broad words such as \`token\` or \`schema\` count
# only alongside a corroborating word, because a bare \`token\` matched "save
# tokens" and a bare \`auth\` matches "author". Missing a real prompt costs a
# suggestion; crying wolf costs the hook.

set -uo pipefail

# UserPromptSubmit delivers a JSON OBJECT on stdin, not the bare prompt. Reading
# it raw matches the envelope's own field names — \`permission_mode\` alone makes
# every prompt look like security work — so the prompt has to be extracted
# first. Caught exactly that way: "merge to main" tripped the security rule.
RAW=$(cat 2>/dev/null)
[ -z "\${RAW:-}" ] && exit 0

if command -v node >/dev/null 2>&1; then
  PROMPT=$(printf '%s' "\$RAW" | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  try { process.stdout.write(String(JSON.parse(d).prompt ?? "")); }
  catch { process.stdout.write(d); }
});' 2>/dev/null)
else
  # No node: fall back to the raw text, but strip the envelope keys that would
  # otherwise fire the rules on their own.
  PROMPT=$(printf '%s' "\$RAW" | sed -E 's/"(permission_mode|transcript_path|session_id|hook_event_name|cwd)"[^,]*//g')
fi

PROMPT=$(printf '%s' "\${PROMPT:-}" | tr '\\n' ' ')
[ -z "\${PROMPT:-}" ] && exit 0

HITS=""

${cases}

if [ -n "$HITS" ]; then
  echo "> Model routing, advisory. A hook cannot switch the model — delegate to the"
  echo "> named subagent (which pins both), or set it yourself with /model and /effort."
  echo ""
  printf '%s' "$HITS"
  echo "  · Full table: docs/index/cross/model-routing.md"
fi

exit 0
`);

  // ── the reference page
  const rows = ROUTING_POLICY.map((r) => [
    `\`${r.agent}\``, `\`${r.model}\``, `\`${r.effort}\``, r.job, r.when,
  ]);

  emit(self, `${head(self, 'Model routing', 'Which model and how much effort each kind of work here gets — and, honestly, which parts of that are automatic and which are not.')}

Policy source: \`scripts/lib/model-routing.mjs\`. Everything below, the subagent
definitions in \`.claude/agents/\` and the advisory hook are all generated from
that one array, so they cannot disagree.

## What actually switches

| Layer | Mechanism | Automatic? |
|---|---|---|
| Work delegated to a subagent | \`.claude/agents/*.md\` frontmatter — \`model:\` and \`effort:\` | **Yes.** Claude Code delegates by matching the agent's \`description\`; nobody picks |
| The main session | \`/model\` and \`/effort\`, or \`model\`/\`effortLevel\` in settings | **No.** Hooks cannot set either — this is a documented limit |
| The main session, advisory | \`.claude/hooks/suggest-model.sh\` (UserPromptSubmit) | Recommends only, and only for the costly categories |

So: hand a job to the matching subagent and the model and effort are chosen for
you. For work you keep in the main session, the table below is what to set by
hand.

## The table

${table(['Agent', 'Model', 'Effort', 'Job', 'Use when'], rows)}

## Why each one

${ROUTING_POLICY.map((r) => `### \`${r.agent}\` — ${r.model} · ${r.effort}

**${r.job}.** Use when ${r.when}.

${r.why}`).join('\n\n')}

## The default direction is down

Every row above has to justify going beyond \`sonnet\` / \`medium\`; nothing has to
justify staying below it. Routing everything to \`opus\` at \`max\` would be far
slower and far more expensive with no benefit on work that does not need it.
The expensive models are spent where being wrong is costly — permissions,
money, migrations and the module boundaries — and nothing extra is spent on
looking a file up, which is the most common thing an agent does here.

## Other tools

\`model\` and \`effort\` frontmatter is Claude Code's mechanism. Cursor, Copilot,
Gemini and the rest each have their own model picker, so for them this table is
guidance rather than configuration — it is reproduced in \`AGENTS.md\` and the
other agent-instruction files so every tool at least gets the policy.
${BACK(self)}`);
}

/* ── Agent instruction files — one body, every tool's filename ─────────── */

/**
 * The same pointer, written to every filename an agent tool looks for.
 *
 * Only Claude Code reads `CLAUDE.md`. Copilot reads
 * `.github/copilot-instructions.md`, Gemini reads `GEMINI.md`, Cursor reads
 * `.cursor/rules/*.mdc`, and a growing set of tools (Codex, Jules, Devin, Amp,
 * Aider, Zed, Warp, Cursor ≥1.0) read `AGENTS.md`. Without these, every
 * non-Claude agent working here starts blind: no index, and — more
 * importantly — no seven laws and no engineering protocol, because those live
 * in a file it never opens.
 *
 * They are GENERATED from one string for the reason everything else here is:
 * eight hand-maintained copies of the same paragraph are eight chances to
 * disagree, and the one that is wrong is the one somebody's agent reads. Each
 * file is a POINTER, never a copy of the rules — `CLAUDE.md` stays the single
 * contract, and these send every tool to it.
 *
 * Adding a tool is one line in AGENT_FILES below.
 *
 * Deliberately carries no counts. These files are themselves tracked, so a
 * figure like "877 files" printed here would feed back into the next build's
 * own totals. Numbers live in `docs/index/SESSION-BRIEF.md`, which the index
 * excludes from its own scan.
 */
{
  const ROUTING = [
    ['orientation — which page answers what', 'docs/index/README.md'],
    ['the whole repository on one screen', 'docs/index/01-MAP.md'],
    ['an API endpoint and the permission guarding it', 'docs/index/cross/routes.md'],
    ['a permission: what enforces it, which roles hold it', 'docs/index/cross/permissions.md'],
    ['a table, column or enum', 'docs/index/cross/data-model.md'],
    ['how two modules talk (domain events)', 'docs/index/cross/events.md'],
    ['an entity’s valid status transitions', 'docs/index/cross/state-machines.md'],
    ['a screen, URL or nav entry', 'docs/index/cross/ui-routes.md'],
    ['whether a component already exists', 'docs/index/cross/components.md'],
    ['how something should look, behave or read', 'docs/index/cross/design-system.md'],
    ['everything about one API module', 'docs/index/modules/<name>.md'],
    ['what a file exports, with line numbers', 'docs/index/symbols/<area>.md'],
    ['every tracked file, by area', 'docs/index/cross/files.md'],
    ['a command, a test, a migration, a doc outline', 'docs/index/cross/{commands,tests,migrations,docs}.md'],
    ['a machine-readable form to jq', 'docs/index/index.json'],
  ];

  const BODY = `## Read the rules first

**\`CLAUDE.md\` at the repository root is the binding contract for every agent
working here, not only for Claude.** It carries the seven laws, the module-pack
architecture, the engineering operating protocol and the definition of done.
Read it before you write code. \`docs/implementation/00-HOUSE-RULES.md\` is its
long form, and \`docs/implementation/\` holds the documents of record.

Nothing in this file overrides it. If they disagree, \`CLAUDE.md\` wins.

## Look it up before you search

This is a large monorepo — four applications, three shared packages, a NestJS
API with independent feature modules, a multi-file Prisma schema and
hand-written forward-only migrations. Searching it from scratch is expensive
and unreliable.

A generated index of the whole repository lives in **\`docs/index/\`**. It is
rebuilt and staged by \`.githooks/pre-commit\` on every commit, so it always
describes the commit you are looking at.

**Open the index page for your question before grepping.** It answers the
things grep answers badly — which permission actually guards a route, which
module publishes an event, whether a component already exists — in one file
instead of forty.

| Looking for | Open |
|---|---|
${ROUTING.map(([q, f]) => `| ${q} | \`${f}\` |`).join('\n')}

Start at \`docs/index/README.md\`. For a compact orientation, read
\`docs/index/SESSION-BRIEF.md\`.

## Three rules about the index

- **Never edit anything under \`docs/index/\` by hand.** It is generated; the next
  commit overwrites your edit. Fix \`scripts/build-index.mjs\`, or fix the code
  the generator read.
- **The index says *where*. \`CLAUDE.md\` and \`docs/implementation/\` say *why* and
  *what you may do*, and they win.** If the index and a document of record
  disagree, the document is right and the generator has a bug.
- **It is a map, not the territory.** Its scanners are line-based, not a type
  checker. Open the file the index points you at — never cite the index as
  evidence that code does something.

## Commands

\`\`\`bash
pnpm install                       # also installs the git hooks (see below)
pnpm lint && pnpm typecheck && pnpm test   # before opening a PR

pnpm index                         # regenerate docs/index/ (zero deps, under a second)
pnpm index:check                   # exit 1 if the committed index is stale — CI runs this
node scripts/install-git-hooks.mjs # if the pre-commit hook is not installed
\`\`\`

If \`docs/index/\` is missing or stale in your checkout, the hook is not
installed — run \`pnpm install\`, or the command above.`;

  const GENERATED_NOTE = (file) => `<!-- GENERATED by scripts/build-index.mjs from one shared body, so that every
     agent tool is told the same thing. DO NOT EDIT: run \`pnpm index\` instead.
     Durable project rules belong in CLAUDE.md, which this file points to. -->`;

  /**
   * filename → which tools read it. Curated rather than exhaustive: each entry
   * is a file some tool will actually open, and one more unread dotfile in the
   * root is clutter (House Rule 6).
   */
  const AGENT_FILES = [
    ['AGENTS.md', 'OpenAI Codex · Jules · Devin · Amp · Factory · Aider · Zed · Warp · Cursor ≥1.0 — the cross-vendor default'],
    ['.github/copilot-instructions.md', 'GitHub Copilot — VS Code, JetBrains, and the Copilot coding agent'],
    ['GEMINI.md', 'Gemini CLI · Gemini Code Assist'],
    ['.windsurfrules', 'Windsurf / Codeium'],
    ['.clinerules', 'Cline · Roo Code'],
    ['.junie/guidelines.md', 'JetBrains Junie'],
  ];

  for (const [file, tools] of AGENT_FILES) {
    emit(file, `${GENERATED_NOTE(file)}

# Working in this repository

_Read by: ${tools}._

${BODY}
`);
  }

  // Cursor's project-rule format needs its own frontmatter to load every time.
  emit('.cursor/rules/repo-index.mdc', `---
description: Repository index and house rules — read before searching the codebase
alwaysApply: true
---

${GENERATED_NOTE('.cursor/rules/repo-index.mdc')}

${BODY}
`);
}

/* ── L0: SESSION-BRIEF.md — what a new session is handed ───────────────── */

/**
 * The compact form, printed into every Claude Code session by the SessionStart
 * hook.
 *
 * README.md is the reader's page and can afford to be complete. This one is
 * spent from the session's context budget on every single start, resume and
 * compaction, so it carries only what changes behaviour: that the index
 * exists, which page answers which question, and the instruction to look
 * before grepping. Anything a session can look up on demand does not belong
 * here.
 */
{
  const self = 'docs/index/SESSION-BRIEF.md';
  const rows = [
    ['an API endpoint, or what guards it', 'docs/index/cross/routes.md'],
    ['a permission — who holds it, what enforces it', 'docs/index/cross/permissions.md'],
    ['a table, column or enum', 'docs/index/cross/data-model.md'],
    ['how two modules talk (domain events)', 'docs/index/cross/events.md'],
    ['a screen, URL or nav entry', 'docs/index/cross/ui-routes.md'],
    ['whether a component already exists', 'docs/index/cross/components.md'],
    ['how something should look, behave or read', 'docs/index/cross/design-system.md'],
    ['everything about one API module', `docs/index/modules/<name>.md`],
    ['what a file exports', 'docs/index/symbols/<area>.md'],
    ['a command to run', 'docs/index/cross/commands.md'],
    ['what is already tested', 'docs/index/cross/tests.md'],
    ['which doc explains WHY', 'docs/index/cross/docs.md'],
  ];

  emit(self, `${GENERATED(self)}

# Repository index — orientation

This repository is **${fmt(records.length)} files / ${fmt(json0lines())} lines** across four apps and
three packages. A generated index of it lives in \`docs/index/\` and is kept in
step with every commit by \`.githooks/pre-commit\`.

**Look it up before you search.** Opening the one page that answers your
question is cheaper and more reliable than grepping \`apps/\` — and the index
knows things grep cannot tell you, such as which permission actually guards a
route or which module publishes an event.

| Looking for | Open |
|---|---|
${rows.map(([q, f]) => `| ${q} | \`${f}\` |`).join('\n')}

Start at **\`docs/index/README.md\`** (routing table) or
**\`docs/index/01-MAP.md\`** (the whole repo on one screen).
Machine-readable: \`docs/index/index.json\`.

At a glance: ${apiModuleNames.length} API feature modules · ${allRoutes.length} HTTP routes ·
${prismaModels.length} tables · ${eventCatalog.length} domain events ·
${permissionCatalog.length} permissions · ${uiRoutes.length} screens ·
${testFiles.length} spec files.

\`docs/index/\` is **generated** — never edit it by hand; run \`pnpm index\`.
\`CLAUDE.md\` and \`docs/implementation/\` remain binding over anything here: the
index says *where*, they say *why* and *what you may do*.
`);
}

function json0lines() {
  return records.reduce((n, r) => n + r.lines, 0);
}

/* ── L0: 01-MAP.md — the whole repository on one screen ────────────────── */

{
  const self = 'docs/index/01-MAP.md';
  const topDirs = new Map();
  for (const r of records) {
    const top = r.rel.includes('/') ? r.rel.split('/').slice(0, r.rel.startsWith('apps/') || r.rel.startsWith('packages/') ? 2 : 1).join('/') : '(root)';
    const e = topDirs.get(top) ?? { files: 0, lines: 0 };
    e.files += 1; e.lines += r.lines;
    topDirs.set(top, e);
  }

  const packRows = Object.entries(modulePacks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, pack]) => {
      const f = featureByName.get(name);
      const routes = allRoutes.filter((rt) => rt.module === name).length;
      const tables = prismaModels.filter((m) => m.file.endsWith(`/${name}.prisma`)).length;
      return [
        `[\`${name}\`](${link(self, moduleFile(name))})`,
        pack,
        f ? (f.alwaysOn ? 'always on' : 'MODULES allowlist') : '—',
        routes || '—',
        tables || '—',
      ];
    });

  emit(self, `${head(self, 'Repository map', 'The shape of the whole thing, one screen. Follow a link down a level for detail.')}

## What this repository is

A **modular monolith ERP + commerce platform**, deliberately not a microservice
mesh (\`docs/implementation/ENTERPRISE-SCALE.md\`, \`RETAIL-ERP.md\`). One NestJS
process per node owns all business state; three front ends talk to it over HTTP.

\`\`\`
apps/api      NestJS + Prisma + Postgres   the only writer of business state
apps/web      Next.js                      admin console (/admin) + storefront
apps/pos      Next.js PWA                  offline-first till, syncs via outbox
apps/mobile   Expo / React Native          customer app
packages/*    TypeScript                   brand, money, permissions, POS core
\`\`\`

## The three axes (from CLAUDE.md — binding)

| Axis | Question | Lives in |
|---|---|---|
| **Sector** | what kind of business | a module pack + the \`MODULES\` allowlist |
| **Brand** | which business | \`packages/shared/src/brand.ts\` |
| **Branch** | where it happened | a \`Location\` row; at chain scale, a node with its own database |

## Top-level layout

${table(['Path', 'Files', 'Lines', 'What it is'], [...topDirs.entries()]
  .sort((a, b) => b[1].lines - a[1].lines)
  .map(([p, e]) => [`\`${p}\``, fmt(e.files), fmt(e.lines), describeTopDir(p)]))}

## The API's feature modules

Each is independent: no module imports another except through a named
\`KNOWN_MODULE_COUPLINGS\` entry, a domain event, or an extension point.
\`pnpm lint\` fails a violation.

${table(['Module', 'Pack', 'Enabled by', 'Routes', 'Tables'], packRows)}

Registry: \`apps/api/src/modules/modules.registry.ts\` ·
Packs: \`apps/api/src/modules/module-packs.ts\`

## The API's core (shared platform, never a feature)

${table(['Subsystem', 'Files', 'What it owns'], apiCoreNames.map((n) => {
  const fs = records.filter((r) => apiCoreOf(r.rel) === n);
  const entry = fs.find((r) => r.doc) ?? fs[0];
  return [`[\`${n}\`](${link(self, coreFile(n))})`, fs.length, clip(entry?.doc ?? '', 110)];
}))}

## Entry points

${table(['Surface', 'Entry file', 'Notes'], [
  ['API bootstrap', '`apps/api/src/main.ts`', 'global pipes, versioning, CORS allowlist'],
  ['API root module', '`apps/api/src/app.module.ts`', 'composes core + the enabled feature modules'],
  ['Module allowlist', '`apps/api/src/modules/modules.registry.ts`', '`MODULES` env decides what boots'],
  ['Web middleware', '`apps/web/src/middleware.ts`', 'locale routing + admin auth redirect'],
  ['Admin shell', '`apps/web/src/components/admin/admin-shell.tsx`', 'sidebar, command palette'],
  ['Admin nav', '`apps/web/src/components/admin/nav-registry.ts`', `sidebar order — ${navItems.length} entries`],
  ['Prisma datasource', '`apps/api/prisma/schema/schema.prisma`', 'generator + datasource only'],
  ['Seed', '`apps/api/prisma/seed.ts`', 'permissions, roles, demo data'],
  ['Brand tokens', '`packages/shared/src/brand.ts`', 'House Rule 1 — no literal anywhere else'],
])}

## Verification (CLAUDE.md, "Before you open a PR")

\`\`\`bash
pnpm lint && pnpm typecheck && pnpm test
\`\`\`

Full command inventory: [\`cross/commands.md\`](${link(self, 'docs/index/cross/commands.md')}).
${BACK(self)}`);
}

function describeTopDir(p) {
  const known = {
    'apps/api': 'NestJS API — modules, core platform, Prisma schema and migrations',
    'apps/web': 'Next.js — admin console and customer storefront in one app',
    'apps/pos': 'Next.js PWA — offline-first point of sale',
    'apps/mobile': 'Expo — customer mobile app',
    'packages/shared': 'brand, money, permissions, measurements, entities',
    'packages/pos-core': 'basket, tender, receipt and outbox maths, UI-free',
    'packages/config': 'shared tsconfig and eslint bases',
    docs: 'documents of record — implementation plans, house rules, brand',
    scripts: 'repository checks and generators (lint gates, this index)',
    deploy: 'systemd units, backup and alert scripts, mail configuration',
    '.github': 'CI and deployment workflows',
    '(root)': 'workspace manifests, docker compose/stack files, env templates',
  };
  return known[p] ?? '';
}

/* ── L1: one page per area ─────────────────────────────────────────────── */

/** Groups an area's files by directory, which is how people actually navigate. */
function dirBreakdown(areaRecords, depth) {
  const groups = new Map();
  for (const r of areaRecords) {
    const parts = r.dir.split('/');
    const key = parts.slice(0, depth).join('/') || '.';
    const g = groups.get(key) ?? { files: [], lines: 0 };
    g.files.push(r); g.lines += r.lines;
    groups.set(key, g);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

const AREA_INTRO = {
  api: `NestJS 11 + Prisma + Postgres. **The only writer of business state** — every
other surface reaches it over HTTP. Authentication is global (\`JwtAuthGuard\`),
so a route with no \`@RequirePermission\` is authenticated-but-unrestricted,
which CLAUDE.md calls "almost never intended".

Structure: \`src/core/\` is the shared platform every deployment runs;
\`src/modules/<name>/\` is one feature module, independent of every other one.`,
  web: `Next.js App Router. **Two products in one deployment**: the admin console under
\`(admin)/admin\` and the customer storefront under \`(storefront)/[locale]\`.
They share primitives in \`src/components/ui\` and nothing else.

Customer-facing text is never English in JSX — it comes from \`messages/*.json\`.
Design literals never appear here either: colour, radius and type step resolve
through \`@newax/shared\`'s \`BRAND\`.`,
  pos: `Next.js PWA for a physical till. **Offline-first**: a sale that already happened
is never rejected by sync (RETAIL-ERP.md R5), so writes go through an IndexedDB
outbox and replay when the network returns. The register maths itself lives in
\`packages/pos-core\`, which has no UI and is unit-tested on its own.`,
  mobile: `Expo / React Native customer app, file-routed under \`app/\`. Talks to the same
API as the web storefront through \`src/api/\`.`,
  packages: `Code shared across surfaces. \`@newax/shared\` is where House Rule 1 is enforced:
every brand, locale and design literal resolves through it, so no application
file may hard-code one.`,
  docs: `The documents of record. These explain **why**; this index only says **where**.
Where a document and this index disagree, the document wins — and the generator
has a bug.`,
  infra: `Repository checks, CI workflows, container and deployment configuration. The
\`scripts/check-*.mjs\` files are lint gates: \`pnpm lint\` runs them and CI fails
on them.`,
  root: `Workspace manifests, Docker compose and stack files, environment templates.`,
};

for (const area of Object.keys(AREA_LABEL)) {
  const areaRecords = records.filter((r) => r.area === area);
  if (areaRecords.length === 0) continue;
  const self = areaFile(area);
  const depth = area === 'packages' ? 3 : area === 'api' || area === 'web' ? 4 : 3;

  const dirRows = dirBreakdown(areaRecords, depth).map(([dir, g]) => {
    const kinds = [...new Set(g.files.map((f) => f.kind))].slice(0, 4).join(', ');
    return [`\`${dir}\``, g.files.length, fmt(g.lines), kinds];
  });

  const entryPoints = areaRecords
    .filter((r) => /^(main|index|app\.module|middleware|layout|globals)\./.test(r.base) || r.base === 'package.json')
    .map((r) => [`\`${r.rel}\``, r.kind, clip(r.doc, 110)]);

  const deepLinks = [];
  if (area === 'api') {
    deepLinks.push(
      `- **Feature modules (L2):** ${apiModuleNames.map((n) => `[\`${n}\`](${link(self, moduleFile(n))})`).join(' · ')}`,
      `- **Core subsystems (L2):** ${apiCoreNames.map((n) => `[\`${n}\`](${link(self, coreFile(n))})`).join(' · ')}`,
      `- **Every route:** [cross/routes.md](${link(self, 'docs/index/cross/routes.md')})`,
      `- **Every table:** [cross/data-model.md](${link(self, 'docs/index/cross/data-model.md')})`,
    );
  }
  if (area === 'web' || area === 'pos' || area === 'mobile') {
    deepLinks.push(
      `- **Every screen:** [cross/ui-routes.md](${link(self, 'docs/index/cross/ui-routes.md')})`,
      `- **Every component:** [cross/components.md](${link(self, 'docs/index/cross/components.md')})`,
    );
  }
  if (areaRecords.some((r) => (r.symbols ?? []).length || (r.reExports ?? []).length)) {
    deepLinks.push(`- **Every exported symbol here:** [symbols/${area}.md](${link(self, `docs/index/symbols/${area}.md`)})`);
  }
  deepLinks.push(`- **Every file here:** [files/${area}.md](${link(self, `docs/index/files/${area}.md`)})`);

  const largest = [...areaRecords].sort((a, b) => b.lines - a.lines).slice(0, 15)
    .map((r) => [`\`${r.rel}\``, fmt(r.lines), r.kind, clip(r.doc, 90)]);

  emit(self, `${head(self, AREA_LABEL[area], `${fmt(areaRecords.length)} files · ${fmt(areaRecords.reduce((n, r) => n + r.lines, 0))} lines`)}

${AREA_INTRO[area] ?? ''}

## Go deeper

${deepLinks.join('\n')}

## Directory breakdown

${table(['Directory', 'Files', 'Lines', 'Mostly'], dirRows)}

${entryPoints.length ? `## Entry points\n\n${table(['File', 'Kind', 'Purpose'], entryPoints)}` : ''}

## Largest files (where the weight is)

${table(['File', 'Lines', 'Kind', 'Purpose'], largest)}
${BACK(self)}`);
}

/* ── L2: one page per API feature module / core subsystem ──────────────── */

/**
 * Renders the page an agent opens when it has been told "work on inventory".
 *
 * Everything that module owns is on this one page: its files, its endpoints
 * and their permissions, the events it publishes and subscribes to, the tables
 * it owns, its scheduled work, its tests, and — the part that is easy to miss
 * by reading — the edges it has to the rest of the system.
 */
function renderUnit({ self, title, subtitle, unitRecords, routeFilter, schemaBase, extraIntro }) {
  const lines = unitRecords.reduce((n, r) => n + r.lines, 0);
  const routes = allRoutes.filter(routeFilter).sort((a, b) => a.path.localeCompare(b.path));
  const owned = new Set(unitRecords.map((r) => r.rel));

  const models = schemaBase ? prismaModels.filter((m) => m.file.endsWith(`/${schemaBase}.prisma`)) : [];
  const enums = schemaBase ? prismaEnums.filter((m) => m.file.endsWith(`/${schemaBase}.prisma`)) : [];

  const publishes = eventCatalog
    .map((e) => ({ e, sites: (publishersBySymbol.get(e.symbol) ?? []).filter((s) => owned.has(s.file)) }))
    .filter((x) => x.sites.length);
  const subscribes = eventCatalog
    .map((e) => ({ e, sites: (subscribersBySymbol.get(e.symbol) ?? []).filter((s) => owned.has(s.file)) }))
    .filter((x) => x.sites.length);

  const jobs = crons.filter((c) => owned.has(c.file));
  const wiring = nestModules.filter((m) => owned.has(m.file));
  const tests = testFiles.filter((t) => owned.has(t.file));

  // Edges: which OTHER modules / core subsystems this one reaches into.
  const edges = new Set();
  for (const r of unitRecords) {
    for (const imp of r.imports ?? []) {
      if (!imp.startsWith('.')) {
        if (imp.startsWith('@newax/')) edges.add(`package \`${imp}\``);
        continue;
      }
      const resolved = imp.replace(/^\.\//, '');
      const up = imp.match(/\.\.\/\.\.\/core\/([\w-]+)/);
      if (up) { edges.add(`core \`${up[1]}\``); continue; }
      const cross = imp.match(/\.\.\/([\w-]+)\/[\w.-]+/);
      if (cross && apiModuleNames.includes(cross[1]) && !owned.has(`apps/api/src/modules/${cross[1]}/`)) {
        if (!r.rel.includes(`/modules/${cross[1]}/`)) edges.add(`**module \`${cross[1]}\`** ⚠ direct import`);
      }
      void resolved;
    }
  }

  const fileRows = [...unitRecords].sort((a, b) => a.rel.localeCompare(b.rel)).map((r) => [
    `\`${basename(r.rel)}\``,
    r.kind,
    r.lines || '—',
    (r.symbols ?? []).length || '—',
    clip(r.doc || (r.symbols ?? [])[0]?.doc || '', 120),
  ]);

  const symbolRows = [...unitRecords]
    .filter((r) => (r.symbols ?? []).length)
    .sort((a, b) => a.rel.localeCompare(b.rel))
    .flatMap((r) => (r.symbols ?? []).map((s) => [
      `\`${s.name}\``, s.kind, `\`${basename(r.rel)}:${s.line}\``, clip(s.doc, 110),
    ]));

  emit(self, `${head(self, title, subtitle)}

${extraIntro ?? ''}

## Files (${unitRecords.length} · ${fmt(lines)} lines)

All paths relative to \`${unitRecords[0] ? dirname(unitRecords[0].rel) : ''}\`.

${table(['File', 'Kind', 'Lines', 'Exports', 'Purpose'], fileRows)}

## HTTP routes (${routes.length})

${routes.length ? table(['Method', 'Path', 'Access', 'Handler', 'Summary'], routes.map((rt) => [
  rt.method, `\`${rt.path}\``,
  rt.permissions.length ? `\`${rt.permissions.join('\` \`')}\`` : (rt.public ? '**PUBLIC**' : rt.authOnly ? 'signed-in' : '**⚠ undecorated**'),
  `\`${rt.controller}.${rt.handler}\` :${rt.line}`,
  clip(rt.summary, 90),
])) : '_This unit exposes no HTTP routes._\n'}

## Domain events

**Publishes** — written to the outbox inside the same transaction as the state change:

${publishes.length ? table(['Event', 'Name', 'Published at'], publishes.map((p) => [
  `\`${p.e.symbol}\``, `\`${p.e.name}\``,
  p.sites.map((s) => `\`${basename(s.file)}:${s.line}\``).join(', '),
])) : '_none_\n'}

**Subscribes** — handlers must be idempotent; delivery is at-least-once:

${subscribes.length ? table(['Event', 'Name', 'Handler'], subscribes.map((p) => [
  `\`${p.e.symbol}\``, `\`${p.e.name}\``,
  p.sites.map((s) => `\`${basename(s.file)}:${s.line}\` → \`${s.handler}()\``).join(', '),
])) : '_none_\n'}

${models.length || enums.length ? `## Tables it owns (\`${schemaBase}.prisma\`)

${table(['Model', 'Fields', 'Line', 'Purpose'], models.map((m) => [
  `\`${m.name}\``, m.fields.length, `:${m.line}`, clip(m.doc, 110),
]))}
${enums.length ? `\nEnums: ${enums.map((e) => `\`${e.name}\` (${e.values.length})`).join(' · ')}\n` : ''}
Full field lists: [cross/data-model.md](${link(self, 'docs/index/cross/data-model.md')}).
` : ''}

${jobs.length ? `## Scheduled work

${table(['Schedule', 'Handler', 'Where', 'What it does'], jobs.map((j) => [
  `\`${j.schedule}\``, `\`${j.handler}()\``, `\`${basename(j.file)}:${j.line}\``, clip(j.doc, 110),
]))}` : ''}

${wiring.length ? `## Nest wiring

${wiring.map((w) => `**\`${w.class}\`** (\`${basename(w.file)}\`)
- imports: ${w.imports.length ? w.imports.map((x) => `\`${x}\``).join(', ') : '—'}
- controllers: ${w.controllers.length ? w.controllers.map((x) => `\`${x}\``).join(', ') : '—'}
- providers: ${w.providers.length ? w.providers.map((x) => `\`${x}\``).join(', ') : '—'}
- exports: ${w.exports.length ? w.exports.map((x) => `\`${x}\``).join(', ') : '—'}`).join('\n\n')}
` : ''}

${edges.size ? `## Reaches out to

${[...edges].sort().map((e) => `- ${e}`).join('\n')}

A \`⚠ direct import\` above is a coupling that \`scripts/check-module-boundaries.mjs\`
either sanctions through \`KNOWN_MODULE_COUPLINGS\` or fails the build over —
check there before adding another.
` : ''}

## Tests (${tests.length})

${tests.length ? table(['Spec', 'Cases', 'Covers'], tests.map((t) => [
  `\`${basename(t.file)}\``, t.cases, clip(t.describes.join(' · '), 120),
])) : '_No spec files in this unit._\n'}

## Every export in this unit

${symbolRows.length ? table(['Symbol', 'Kind', 'Where', 'Doc'], symbolRows) : '_none_\n'}
${BACK(self)}`);
}

for (const name of apiModuleNames) {
  const unitRecords = records.filter((r) => apiModuleOf(r.rel) === name);
  const feature = featureByName.get(name);
  const pack = modulePacks[name] ?? '**unclassified — `pnpm lint` fails on this**';
  const moduleDoc = unitRecords.find((r) => r.base.endsWith('.module.ts'))?.doc
    ?? unitRecords.find((r) => r.doc)?.doc ?? '';
  renderUnit({
    self: moduleFile(name),
    title: `Module: \`${name}\``,
    subtitle: `Pack **${pack}** · ${feature ? (feature.alwaysOn ? 'always on' : 'enabled by the `MODULES` allowlist') : 'not in `FEATURE_MODULES`'} · ${unitRecords.length} files`,
    unitRecords,
    routeFilter: (rt) => rt.module === name,
    schemaBase: records.some((r) => r.rel === `apps/api/prisma/schema/${name}.prisma`) ? name : null,
    extraIntro: [
      moduleDoc ? `> ${moduleDoc}` : '',
      feature?.note ? `\n**Registry note** (\`modules.registry.ts\`): ${feature.note}` : '',
      `\nSource: \`apps/api/src/modules/${name}/\``,
    ].filter(Boolean).join('\n'),
  });
}

for (const name of apiCoreNames) {
  const unitRecords = records.filter((r) => apiCoreOf(r.rel) === name);
  const doc = unitRecords.find((r) => r.doc)?.doc ?? '';
  renderUnit({
    self: coreFile(name),
    title: `Core: \`${name}\``,
    subtitle: `Shared platform — available to every module, part of no feature · ${unitRecords.length} files`,
    unitRecords,
    routeFilter: (rt) => rt.module === `core/${name}`,
    schemaBase: null,
    extraIntro: `${doc ? `> ${doc}\n` : ''}\nSource: \`apps/api/src/core/${name}/\`\n\nCore is what every deployment runs. A core file may never import a feature\nmodule — \`scripts/check-module-boundaries.mjs\` fails the build over it.`,
  });
}

/* ── L3: per-file symbol tables ────────────────────────────────────────── */

/**
 * The symbol level, grouped by directory.
 *
 * For the API this page deliberately does NOT repeat what the L2 module pages
 * already carry — duplicating 1,200 symbols would double the index's weight
 * and give an agent two places to disagree. It points at the module pages and
 * covers only what no module page owns (Prisma, e2e tests, the app root).
 */
function renderSymbolPage(area, recordsForArea, extraTop = '') {
  const self = `docs/index/symbols/${area}.md`;
  const withSymbols = recordsForArea.filter((r) => (r.symbols ?? []).length || (r.reExports ?? []).length);
  const groups = new Map();
  for (const r of withSymbols) {
    if (!groups.has(r.dir)) groups.set(r.dir, []);
    groups.get(r.dir).push(r);
  }
  const sections = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dir, rs]) => {
    const rows = rs.sort((a, b) => a.rel.localeCompare(b.rel)).flatMap((r) => {
      const sym = (r.symbols ?? []).map((s) => [
        `\`${r.base}\``, `\`${s.name}\``, s.kind, `:${s.line}`, clip(s.doc, 100),
      ]);
      const re = (r.reExports ?? []).map((x) => [
        `\`${r.base}\``, x.names.map((n) => `\`${n}\``).join(' '), 're-export', '', `from \`${x.from}\``,
      ]);
      return [...sym, ...re];
    });
    return `### \`${dir}\`\n\n${table(['File', 'Symbol', 'Kind', 'Line', 'Doc'], rows)}`;
  });

  emit(self, `${head(self, `Symbols — ${area}`, `Every top-level export in \`${area}\`, with the line to open.`)}

${extraTop}

${sections.join('\n')}
${BACK(self)}`);
}

for (const area of ['web', 'pos', 'mobile', 'packages', 'infra', 'root']) {
  const rs = records.filter((r) => r.area === area);
  if (rs.some((r) => (r.symbols ?? []).length || (r.reExports ?? []).length)) renderSymbolPage(area, rs);
}

{
  const self = 'docs/index/symbols/api.md';
  const covered = (r) => apiModuleOf(r.rel) || apiCoreOf(r.rel);
  const rest = records.filter((r) => r.area === 'api' && !covered(r));
  renderSymbolPage('api', rest, `Per-module and per-core-subsystem symbols live on their own L2 pages, so they
are not repeated here — one list, one place to be wrong:

- Modules: ${apiModuleNames.map((n) => `[\`${n}\`](${link(self, moduleFile(n))})`).join(' · ')}
- Core: ${apiCoreNames.map((n) => `[\`${n}\`](${link(self, coreFile(n))})`).join(' · ')}

Below: everything in \`apps/api\` that no module or core page owns — the app
root, Prisma tooling, and the e2e suite.`);
}

/* ── ⊗ cross/files.md + files/<area>.md — the completeness ledger ──────── */

{
  const areaPage = (a) => `docs/index/files/${a}.md`;

  for (const area of Object.keys(AREA_LABEL)) {
    const rs = records.filter((r) => r.area === area);
    if (!rs.length) continue;
    const self = areaPage(area);
    const groups = new Map();
    for (const r of rs) {
      if (!groups.has(r.dir)) groups.set(r.dir, []);
      groups.get(r.dir).push(r);
    }
    const sections = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dir, g]) =>
      `### \`${dir}\` (${g.length})\n\n${table(['File', 'Kind', 'Lines', 'Purpose'],
        g.sort((a, b) => a.base.localeCompare(b.base)).map((r) => [
          `\`${r.base}\``, r.kind, r.lines || '—', clip(r.doc, 120),
        ]))}`);

    emit(self, `${head(self, `Files — ${area}`, `All ${fmt(rs.length)} tracked files in \`${AREA_LABEL[area].split(' — ')[0]}\`, by directory.`)}

\`Lines\` is blank for binary assets. Headings are exact paths — find on one to jump.

${sections.join('\n')}

---

[← all files](${link(self, 'docs/index/cross/files.md')}) · [L1 page](${link(self, areaFile(area))}) · [← index home](${link(self, 'docs/index/README.md')})
`);
  }

  const self = 'docs/index/cross/files.md';
  const kindCounts = new Map();
  for (const r of records) kindCounts.set(r.kind, (kindCounts.get(r.kind) ?? 0) + 1);

  emit(self, `${head(self, 'Every tracked file', `All **${fmt(records.length)}** files git tracks. This is the index's completeness guarantee: every file in the repository is on one of the pages below, with its kind, size and purpose.`)}

Split by area so you load one, not all of them.

${table(['Area', 'Files', 'Lines', 'Open'], Object.keys(AREA_LABEL)
  .filter((a) => areaStats[a])
  .map((a) => [
    AREA_LABEL[a].split(' — ')[0],
    fmt(areaStats[a].files),
    fmt(areaStats[a].lines),
    `[files/${a}.md](${link(self, areaPage(a))})`,
  ]))}

## What kinds of file this repository contains

Kind is inferred from this repository's own naming conventions
(\`*.service.ts\`, \`*.controller.ts\`, \`page.tsx\`, …), which is also how you should
name a new file: the convention is what makes it findable.

${table(['Kind', 'Count'], [...kindCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, n]))}
${BACK(self)}`);
}

/* ── ⊗ cross/routes.md ─────────────────────────────────────────────────── */

{
  const self = 'docs/index/cross/routes.md';
  const undecorated = allRoutes.filter((r) => r.permissions.length === 0 && !r.public && !r.authOnly);
  const publicRoutes = allRoutes.filter((r) => r.public);
  const byModule = new Map();
  for (const r of allRoutes) {
    if (!byModule.has(r.module)) byModule.set(r.module, []);
    byModule.get(r.module).push(r);
  }

  const sections = [...byModule.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mod, rs]) => {
    const page = mod.startsWith('core/') ? coreFile(mod.slice(5)) : moduleFile(mod);
    const heading = existsUnitPage(mod) ? `### [\`${mod}\`](${link(self, page)}) (${rs.length})` : `### \`${mod}\` (${rs.length})`;
    return `${heading}\n\n${table(['Method', 'Path', 'Access', 'Handler', 'Summary'], rs.map((rt) => [
      rt.method, `\`${rt.path}\``,
      rt.permissions.length ? `\`${rt.permissions.join('\` \`')}\`` : rt.public ? '**PUBLIC**' : rt.authOnly ? 'signed-in' : '**⚠ undecorated**',
      `\`${rt.controller}.${rt.handler}\``,
      clip(rt.summary, 80),
    ]))}`;
  });

  emit(self, `${head(self, 'HTTP routes', `All **${allRoutes.length}** endpoints across **${controllers.length}** controllers, with the access rule that actually guards each one.`)}

## How to read the Access column

\`JwtAuthGuard\` and \`PermissionGuard\` are registered **globally**, so:

| Access shown | Means |
|---|---|
| \`some.permission\` | \`@RequirePermission\` — the caller must hold at least one of the listed keys |
| **PUBLIC** | \`@Public()\` — reachable with no token at all |
| signed-in | \`@AuthenticatedOnly()\` — deliberately open to any signed-in user; the handler scopes to \`user.id\` |
| **⚠ undecorated** | no decorator. Authenticated but unrestricted — CLAUDE.md: "almost never intended" |

Security is enforced **server-side only**. A UI permission check is a convenience,
never authorization.

## Attention list

- **Undecorated routes: ${undecorated.length}**${undecorated.length ? `\n\n${table(['Method', 'Path', 'Handler', 'File'], undecorated.map((r) => [r.method, `\`${r.path}\``, `\`${r.controller}.${r.handler}\``, `\`${r.file}:${r.line}\``]))}` : ' — none.\n'}
- **Public routes: ${publicRoutes.length}** — every one is an intentional decision; changing one changes the product's attack surface.

${publicRoutes.length ? table(['Method', 'Path', 'Handler'], publicRoutes.map((r) => [r.method, `\`${r.path}\``, `\`${r.controller}.${r.handler}\``])) : ''}

## By module

${sections.join('\n')}
${BACK(self)}`);
}

function existsUnitPage(mod) {
  if (mod.startsWith('core/')) return apiCoreNames.includes(mod.slice(5));
  return apiModuleNames.includes(mod);
}

/* ── ⊗ cross/permissions.md ────────────────────────────────────────────── */

{
  const self = 'docs/index/cross/permissions.md';
  const byCategory = new Map();
  for (const p of permissionCatalog) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category).push(p);
  }

  const sections = [...byCategory.entries()].map(([cat, ps]) =>
    `### ${cat}\n\n${table(['Key', 'Label', 'Risk', 'API routes', 'UI sites', 'Roles granted at seed'], ps.map((p) => {
      const u = permissionUse.get(p.key);
      const roles = rolesGranting(p.key);
      return [
        `\`${p.key}\``, clip(p.label, 80), p.sensitivity,
        u.api.length ? String(u.api.length) : '**0 — enforces nothing**',
        u.web.length || '—',
        roles.length ? roles.join(', ') : '**none — no live user holds it**',
      ];
    }))}`);

  const orphanApi = permissionCatalog.filter((p) => permissionUse.get(p.key).api.length === 0);
  const orphanSeed = permissionCatalog.filter((p) => rolesGranting(p.key).length === 0);
  const undeclared = [...permissionUse.entries()].filter(([, v]) => v.undeclared);

  emit(self, `${head(self, 'Permissions', `All **${permissionCatalog.length}** permissions in \`PERMISSION_CATALOG\`, mapped to the routes that enforce them, the UI that checks them, and the seed that grants them.`)}

Catalogue: \`packages/shared/src/permissions.ts\` ·
Guard: \`apps/api/src/core/auth/guards.ts\` ·
Seed: \`apps/api/prisma/seed.ts\`

Permissions are **capabilities, not roles**. Which role holds which permission is
data (\`RolePermission\`), editable from \`/admin/settings\` — so this index maps
the *catalogue*, not any particular deployment's grants.

## Where a permission can go wrong

| Column reads | Meaning |
|---|---|
| \`API routes\` = 0 | the key exists but no route requires it — scaffolding, not access control |
| \`Roles granted at seed\` = none | \`ROLE_PERMISSION_SEED\` gives it to no role, so no live user holds it unless an admin grants it by hand — the \`seedPermissions()\` vs \`seedRoles()\` trap CLAUDE.md names |
| \`UI call sites\` = — | nothing in the admin UI gates on it; if a screen needs it, the screen is missing |

- Permissions enforcing **no route**: **${orphanApi.length}**${orphanApi.length ? ` — ${orphanApi.map((p) => `\`${p.key}\``).join(', ')}` : ''}
- Permissions **no seeded role grants**: **${orphanSeed.length}**${orphanSeed.length ? ` — ${orphanSeed.map((p) => `\`${p.key}\``).join(', ')}` : ''}
- Keys required by a route but **not in the catalogue**: **${undeclared.length}**${undeclared.length ? ` — ${undeclared.map(([k]) => `\`${k}\``).join(', ')}` : ''}

## The catalogue

${sections.join('\n')}

## Role → permission, as seeded

\`ROLE_PERMISSION_SEED\` in \`packages/shared/src/permissions.ts\`. This is the
*starting* grant only: \`RolePermission\` is data, and an admin may have edited it
on any given deployment. A user's effective set is their role's grants with
their own \`UserPermission\` GRANT/REVOKE overrides applied on top
(\`PermissionsResolverService.resolveForUser\`).

${table(['Role', 'Grants', 'Permissions'], Object.entries(roleSeed).map(([role, keys]) => [
  `\`${role}\``, keys.length, keys.map((k) => `\`${k}\``).join(' '),
]))}

## Admin nav → permission

The sidebar is generated from \`apps/web/src/components/admin/nav-registry.ts\`.
A nav entry with a permission is hidden from anyone who lacks it.

${table(['Group', 'Label', 'Href', 'Permission', 'Module gate'], navItems.map((n) => [
  n.group, n.label, `\`${n.href}\``, n.permission ? `\`${n.permission}\`` : '—', n.module ? `\`${n.module}\`` : '—',
]))}
${BACK(self)}`);
}

/* ── ⊗ cross/data-model.md + data/<schema>.md ──────────────────────────── */

{
  const bySchema = new Map();
  for (const m of prismaModels) {
    const f = basename(m.file, '.prisma');
    if (!bySchema.has(f)) bySchema.set(f, { models: [], enums: [] });
    bySchema.get(f).models.push(m);
  }
  for (const e of prismaEnums) {
    const f = basename(e.file, '.prisma');
    if (!bySchema.has(f)) bySchema.set(f, { models: [], enums: [] });
    bySchema.get(f).enums.push(e);
  }
  const schemaPage = (name) => `docs/index/data/${name}.md`;

  const RULES = `Three rules govern every table here — from the schema's own comments and
CLAUDE.md, and each one is a defect if broken, not a preference:

1. **Money is integer paisa.** Rs 3,499 is \`349900\`. Never a float, anywhere.
2. **Customer-facing text is never a column.** It lives in \`*Translation\` rows,
   one per locale, so adding a language needs no migration.
3. **Every movement of value names its location.** A stock change without a
   \`locationId\` is a bug, not a default, and no query spans branches implicitly.

Migrations are **hand-written and forward-only** — never \`prisma migrate diff\`
against a real database.`;

  // ── one page per schema file: the full field lists
  for (const [schema, g] of bySchema) {
    const self = schemaPage(schema);
    const owner = apiModuleNames.includes(schema)
      ? `Owned by module [\`${schema}\`](${link(self, moduleFile(schema))}).`
      : schema === 'core' || schema === 'schema'
        ? 'Foundational — owned by no single module.'
        : 'Owned by the core platform.';

    const modelBlocks = g.models.map((m) => {
      const rows = m.fields.map((f) => [
        `\`${f.name}\``, `\`${f.type}\``,
        [f.id && 'id', f.unique && 'unique', f.relation && 'relation', f.optional && 'optional'].filter(Boolean).join(', ') || '',
        clip(f.note || f.attrs, 90),
      ]);
      return `### \`${m.name}\`  <sub>\`${m.file}:${m.line}\`</sub>\n\n${m.doc ? `> ${m.doc}\n\n` : ''}${table(['Field', 'Type', 'Flags', 'Notes'], rows)}${m.indexes.length ? `\nIndexes: ${m.indexes.map((i) => `\`${i}\``).join(' · ')}\n` : ''}`;
    });

    const enumBlocks = g.enums.map((e) =>
      `### \`${e.name}\`  <sub>\`${e.file}:${e.line}\`</sub>\n\n${e.doc ? `> ${e.doc}\n\n` : ''}${table(['Value', 'Meaning'], e.values.map((v) => [`\`${v}\``, clip(e.notes[v] ?? '', 110)]))}`);

    emit(self, `${head(self, `Schema: \`${schema}.prisma\``, `${g.models.length} models · ${g.enums.length} enums. ${owner}`)}

${RULES}

${g.models.length ? `## Models\n\n${modelBlocks.join('\n')}` : ''}

${g.enums.length ? `## Enums\n\n${enumBlocks.join('\n')}` : ''}

---

[← all schemas](${link(self, 'docs/index/cross/data-model.md')}) · [← index home](${link(self, 'docs/index/README.md')})
`);
  }

  // ── the summary page: every model on one line, linking to its detail
  const self = 'docs/index/cross/data-model.md';
  const schemaRows = [...bySchema.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([schema, g]) => [
    `[\`${schema}.prisma\`](${link(self, schemaPage(schema))})`,
    g.models.length, g.enums.length,
    apiModuleNames.includes(schema) ? `[\`${schema}\`](${link(self, moduleFile(schema))})` : schema === 'core' || schema === 'schema' ? 'foundational' : 'core platform',
    clip(g.models.map((m) => m.name).join(', '), 130),
  ]);

  const modelRows = prismaModels.map((m) => {
    const schema = basename(m.file, '.prisma');
    const key = m.fields.filter((f) => f.id).map((f) => f.name).join(', ');
    return [
      `[\`${m.name}\`](${link(self, schemaPage(schema))}#${anchor(m.name)})`,
      `\`${schema}\``, m.fields.length,
      m.fields.filter((f) => f.relation).length,
      key || '—',
      clip(m.doc, 90),
    ];
  });

  emit(self, `${head(self, 'Data model', `All **${prismaModels.length}** Prisma models and **${prismaEnums.length}** enums. This page is the directory; full field lists live one click down, per schema file, so you load only the part you need.`)}

Schema: \`apps/api/prisma/schema/\` (Prisma multi-file schema) ·
History: [cross/migrations.md](${link(self, 'docs/index/cross/migrations.md')})

${RULES}

## Schema files

${table(['Schema', 'Models', 'Enums', 'Owner', 'Contains'], schemaRows)}

## Every model

${table(['Model', 'Schema', 'Fields', 'Relations', 'Key', 'Purpose'], modelRows)}

## Every enum

${table(['Enum', 'Schema', 'Values'], prismaEnums.map((e) => {
  const schema = basename(e.file, '.prisma');
  return [
    `[\`${e.name}\`](${link(self, schemaPage(schema))}#${anchor(e.name)})`,
    `\`${schema}\``,
    clip(e.values.map((v) => `\`${v}\``).join(' '), 150),
  ];
}))}
${BACK(self)}`);
}

/* ── ⊗ cross/events.md ─────────────────────────────────────────────────── */

{
  const self = 'docs/index/cross/events.md';
  const rows = eventCatalog.map((e) => {
    const pubs = publishersBySymbol.get(e.symbol) ?? [];
    const subs = subscribersBySymbol.get(e.symbol) ?? [];
    return [
      `\`${e.name}\``,
      `\`${e.symbol}\``,
      pubs.length ? [...new Set(pubs.map((p) => moduleLabel(p.file)))].join(', ') : '**none**',
      subs.length ? [...new Set(subs.map((s) => moduleLabel(s.file)))].join(', ') : '_none_',
    ];
  });

  const detail = eventCatalog.map((e) => {
    const pubs = publishersBySymbol.get(e.symbol) ?? [];
    const subs = subscribersBySymbol.get(e.symbol) ?? [];
    return `### \`${e.name}\`

${e.doc ? `> ${e.doc}\n` : ''}
**Published by**

${pubs.length ? table(['Where', 'Module'], pubs.map((p) => [`\`${p.file}:${p.line}\``, moduleLabel(p.file)])) : '_Nothing publishes this event._\n'}

**Subscribed by**

${subs.length ? table(['Handler', 'Where', 'Module'], subs.map((s) => [`\`${s.handler}()\``, `\`${s.file}:${s.line}\``, moduleLabel(s.file)])) : '_Nothing subscribes. Publishing it is a no-op today._\n'}`;
  });

  const orphanPub = eventCatalog.filter((e) => !(publishersBySymbol.get(e.symbol) ?? []).length);
  const orphanSub = eventCatalog.filter((e) => !(subscribersBySymbol.get(e.symbol) ?? []).length);

  emit(self, `${head(self, 'Domain events', `All **${eventCatalog.length}** events in the catalogue, with every publisher and subscriber. This is how modules reach each other — nothing calls another module's service for a side effect.`)}

Catalogue: \`apps/api/src/core/events/domain-events.ts\` ·
Bus: \`apps/api/src/core/events/event-bus.service.ts\` ·
Delivery: \`apps/api/src/core/events/outbox.dispatcher.ts\`

## The contract

\`publish()\` takes the transaction client, so the event row is written in the
**same transaction** as the state change that caused it — either the order and
its event both exist, or neither does. The dispatcher then delivers pending rows
with backoff, so delivery is **at-least-once** and **every subscriber must be
idempotent**.

That is also why an event is the extension point: "award loyalty points on every
order" is a new file, not an edit to checkout.

## Attention list

- Events **nothing publishes**: ${orphanPub.length ? orphanPub.map((e) => `\`${e.name}\``).join(', ') : 'none'}
- Events **nothing subscribes to**: ${orphanSub.length ? orphanSub.map((e) => `\`${e.name}\``).join(', ') : 'none'}

## Summary

${table(['Event', 'Symbol', 'Published by', 'Subscribed by'], rows)}

## Detail

${detail.join('\n')}
${BACK(self)}`);
}

function moduleLabel(file) {
  const m = apiModuleOf(file);
  if (m) return `\`${m}\``;
  const c = apiCoreOf(file);
  if (c) return `core/\`${c}\``;
  return `\`${basename(file)}\``;
}

/* ── ⊗ cross/state-machines.md ─────────────────────────────────────────── */

{
  const self = 'docs/index/cross/state-machines.md';
  const rows = stateMachines.map((s) => [`\`${s.name}\``, `\`${s.typeParam}\``, moduleLabel(s.file), `\`${s.file}:${s.line}\``]);

  const detail = stateMachines.map((s) => `### \`${s.name}\` (${moduleLabel(s.file)})

${s.doc ? `> ${s.doc}\n` : ''}\`${s.file}:${s.line}\`

\`\`\`ts
${s.body}
\`\`\``);

  emit(self, `${head(self, 'State machines', `Every **${stateMachines.length}** \`Record<XStatus, XStatus[]>\`-shaped transition table in the codebase — a read-only, generated inventory (architecture-patterns/106-finite-state-machines-registry.md, WO-106.1), never a second enforcement path and never runtime-editable.`)}

## What this page is, and is not

Each table below is the **sole authority** for its own entity's valid state
transitions, checked before every write in the module that owns it. This page
only *lists* them for operator visibility — it changes nothing, and an
administrator cannot edit a transition here. A structural transition (can a
\`PENDING\` order become \`DELIVERED\` directly?) is a code-level invariant other
code depends on, never a client-configurable policy.

**What this scanner cannot see.** It matches one literal shape: a named
\`Record<XStatus, XStatus[]>\` constant. A status enum whose valid transitions
are instead enforced by scattered inline checks per method (no single named
table) is real, and just as authoritative, but structurally invisible to a
line-based scanner — it is not "missing," it is a different, equally valid
enforcement shape this page cannot enumerate. Read the owning service's own
methods for those.

## Summary

${table(['Table', 'Entity status type', 'Module', 'Where'], rows)}

## Detail

${detail.join('\n\n')}
${BACK(self)}`);
}

/* ── ⊗ cross/jobs.md ───────────────────────────────────────────────────── */

{
  const self = 'docs/index/cross/jobs.md';
  emit(self, `${head(self, 'Background work', `**${crons.length}** scheduled jobs plus the outbox dispatcher and replication agent — everything that runs without a request.`)}

Background work is invisible in the UI and easy to forget exists. Anything here
runs on every node that has its module enabled.

## Cron jobs

${table(['Schedule (UTC)', 'Handler', 'Module', 'Where', 'What it does'], crons
  .sort((a, b) => a.file.localeCompare(b.file))
  .map((c) => [`\`${c.schedule}\``, `\`${c.handler}()\``, moduleLabel(c.file), `\`${c.file}:${c.line}\``, clip(c.doc, 100)]))}

## Continuous workers

${table(['Worker', 'File', 'What it does'], [
  ['Outbox dispatcher', '`apps/api/src/core/events/outbox.dispatcher.ts`', 'drains `OutboxEvent` to in-process subscribers, retrying with backoff — at-least-once delivery'],
  ['Replication sync agent', '`apps/api/src/core/replication/replication-sync.agent.ts`', 'pushes and pulls node-scoped changes between branch nodes and the hub'],
  ['POS outbox sync', '`apps/pos/src/lib/outbox-sync.ts`', 'replays tills\' offline sales when the network returns (RETAIL-ERP.md R5)'],
].filter(([, f]) => byPath.has(f.replace(/`/g, ''))))}
${BACK(self)}`);
}

/* ── ⊗ cross/ui-routes.md ──────────────────────────────────────────────── */

{
  const self = 'docs/index/cross/ui-routes.md';
  const bySurface = new Map();
  for (const r of uiRoutes) {
    if (!bySurface.has(r.surface)) bySurface.set(r.surface, []);
    bySurface.get(r.surface).push(r);
  }
  const navByHref = new Map(navItems.map((n) => [n.href.replace(/^ROUTES\./, ''), n]));

  const sections = [...bySurface.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([surface, rs]) =>
    `### ${surface} (${rs.length})\n\n${table(['URL', 'Kind', 'Client?', 'File'], rs.map((r) => [
      `\`${r.url}\``, r.kind, r.client ? 'client' : 'server', `\`${r.file}\``,
    ]))}`);

  const missing = [];
  for (const app of ['apps/web', 'apps/pos']) {
    for (const f of ['global-error.tsx', 'not-found.tsx']) {
      if (!byPath.has(`${app}/src/app/${f}`)) missing.push(`\`${app}/src/app/${f}\``);
    }
    if (!records.some((r) => r.rel.startsWith(`${app}/src/app/`) && r.base === 'error.tsx')) {
      missing.push(`\`${app}\` has no \`error.tsx\` anywhere`);
    }
  }

  emit(self, `${head(self, 'Screens', `All **${uiRoutes.length}** routable files across the web app, the till and the mobile app.`)}

Route groups \`(admin)\` and \`(storefront)\` do not appear in the URL; \`[param]\`
segments do. \`Client?\` is whether the file carries \`'use client'\`.

## No dead ends (CLAUDE.md)

Every Next app must ship a root \`global-error.tsx\` and \`not-found.tsx\`, plus an
\`error.tsx\` that actually covers its routes. Falling through to the framework
default means no branding, no nav, and no way back into the product.

${missing.length ? `**Missing today:**\n\n${missing.map((m) => `- ${m}`).join('\n')}\n` : '**All present.**\n'}

## Admin sidebar

Order is \`NAV_GROUPS\`' order in \`apps/web/src/components/admin/nav-registry.ts\`
and nothing else. A capability with no entry here is reachable only by typing a
URL, which CLAUDE.md counts as not shipped.

${table(['Group', 'Label', 'Href', 'Permission', 'Module'], navItems.map((n) => [
  n.group, n.label, `\`${n.href}\``, n.permission ? `\`${n.permission}\`` : '—', n.module ? `\`${n.module}\`` : '—',
]))}

## Every screen

${sections.join('\n')}
${BACK(self)}`);
  void navByHref;
}

/* ── ⊗ cross/components.md ─────────────────────────────────────────────── */

{
  const self = 'docs/index/cross/components.md';
  const componentRecords = records.filter((r) => r.ext === '.tsx' && r.rel.includes('/components/'));

  // Usage count: how many files import each component module.
  const usage = new Map();
  for (const r of componentRecords) usage.set(r.rel, 0);
  for (const r of records) {
    if (!isTs(r)) continue;
    for (const imp of r.imports ?? []) {
      for (const c of componentRecords) {
        const stem = c.rel.replace(/\.tsx$/, '');
        if (imp.endsWith(`/${basename(stem)}`) || imp.endsWith(basename(stem))) {
          if (imp.startsWith('@/components') || imp.startsWith('.')) {
            usage.set(c.rel, (usage.get(c.rel) ?? 0) + 1);
          }
        }
      }
    }
  }

  const groups = new Map();
  for (const r of componentRecords) {
    if (!groups.has(r.dir)) groups.set(r.dir, []);
    groups.get(r.dir).push(r);
  }

  const sections = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dir, rs]) =>
    `### \`${dir}\` (${rs.length})\n\n${table(['Component file', 'Exports', 'Client?', 'Imported by', 'Purpose'],
      rs.sort((a, b) => a.base.localeCompare(b.base)).map((r) => [
        `\`${r.base}\``,
        (r.symbols ?? []).map((s) => `\`${s.name}\``).join(' ') || '—',
        r.client ? 'client' : 'server',
        usage.get(r.rel) || 0,
        clip(r.doc, 100),
      ]))}`);

  emit(self, `${head(self, 'Components', `All **${componentRecords.length}** component files, with how many modules import each. Check here before writing markup — CLAUDE.md: "most drift here came from someone building a thing that already existed".`)}

## The primitives you must reuse

\`apps/web/src/components/ui\` — grep for the literal before adding one.

| Import | For |
|---|---|
| \`PageHeader\` | context, title, one line, ONE primary action |
| \`Section\` | a titled region with no box around it |
| \`SectionRail\` | parts of one object — all present, jump to any |
| \`Tabs\` | separate tasks on one object — one at a time |
| \`Disclosure\` | rare, advanced or destructive — closed by default |
| \`MetricStrip\` | a row of figures; \`detail\` opens a panel |
| \`DataTable\` \`EmptyState\` \`Badge\` \`Button\` \`Dialog\` \`Loading\` | as named |

Cross-surface: \`components/common/status-badge\` is **the** status pill — do not
write an eighth. \`components/common/wizard\` is the only wizard.

**Never** hand-roll: an alert, a status pill, a table, or a modal.

${sections.join('\n')}
${BACK(self)}`);
}

/* ── ⊗ cross/migrations.md ─────────────────────────────────────────────── */

{
  const self = 'docs/index/cross/migrations.md';
  emit(self, `${head(self, 'Migrations', `**${migrations.length}** migrations, oldest first. Hand-written and forward-only — never \`prisma migrate diff\` against a real database.`)}

Location: \`apps/api/prisma/schema/migrations/\` ·
Lock: \`migration_lock.toml\` ·
Apply: \`pnpm --filter @newax/api db:deploy\`

Before changing the database: inspect the current schema, identify
relationships, review existing migrations, check constraints and indexes,
consider backward compatibility and rollback, then write the migration by hand
with a stated reason.

## Schema vs. migrations

Prisma generates its client from the \`.prisma\` files, **not** from the database,
so a model that never got a migration still typechecks, still lints and still
passes any test that does not touch a real database. It fails only when someone
builds a database from these migrations — a fresh deployment, a new developer,
CI's own seed step.

This section compares the two sides. It is a statement of fact, not a gate:
nothing here fails a build.

${drift.missingTables.length === 0 && drift.missingColumns.length === 0 && drift.missingEnums.length === 0
  ? '**In step.** Every model, column and enum the schema declares is built by a migration.\n'
  : `> [!WARNING]
> The schema declares **${drift.missingTables.length} table(s)**, **${drift.missingColumns.length} column(s)** and **${drift.missingEnums.length} enum(s)** that no committed migration creates.
> A database built from \`migrations/\` alone will be missing them.

${drift.missingTables.length ? `### Models with no migration (${drift.missingTables.length})\n\n${table(['Model', 'Table', 'Declared at'], drift.missingTables.map((d) => [`\`${d.model}\``, `\`${d.table}\``, `\`${d.file}:${d.line}\``]))}` : ''}

${drift.missingColumns.length ? `### Columns with no migration (${drift.missingColumns.length})\n\n${table(['Table', 'Column', 'Type', 'Declared at'], drift.missingColumns.map((d) => [`\`${d.table}\``, `\`${d.column}\``, `\`${d.type}\``, `\`${d.file}:${d.line}\``]))}` : ''}

${drift.missingEnums.length ? `### Enums with no migration (${drift.missingEnums.length})\n\n${table(['Enum', 'Declared at'], drift.missingEnums.map((d) => [`\`${d.enum}\``, `\`${d.file}:${d.line}\``]))}` : ''}
`}

## Every migration

${table(['Date', 'Migration', 'Statements', 'Kinds', 'Tables touched'], migrations.map((m) => [
  m.date, `\`${m.slug}\``, m.statements, m.kinds.join(', '), clip(m.tables.join(', '), 110),
]))}
${BACK(self)}`);
}

/* ── ⊗ cross/commands.md ───────────────────────────────────────────────── */

{
  const self = 'docs/index/cross/commands.md';
  const byPkg = new Map();
  for (const s of workspaceScripts) {
    if (!byPkg.has(s.pkg)) byPkg.set(s.pkg, []);
    byPkg.get(s.pkg).push(s);
  }
  const checkScripts = records.filter((r) => r.rel.startsWith('scripts/') && /\.(mjs|py)$/.test(r.ext));

  emit(self, `${head(self, 'Commands', `Every script in every \`package.json\` (**${workspaceScripts.length}**), plus the repository's own check scripts.`)}

## The one you run before a PR

\`\`\`bash
pnpm lint && pnpm typecheck && pnpm test
\`\`\`

Both apps are at **0 errors and 0 warnings**. Keep them there. Automated
verification is the authority — never claim success from reading the diff.

## Index maintenance

\`\`\`bash
pnpm index          # regenerate docs/index/
pnpm index:check    # exit 1 if stale — CI and the pre-commit hook run this
\`\`\`

## By package

${[...byPkg.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([pkg, ss]) =>
  `### \`${pkg}\`  <sub>\`${ss[0].file}\`</sub>\n\n${table(['Script', 'Runs'], ss.map((s) => [`\`${s.name}\``, `\`${clip(s.cmd, 150)}\``]))}`).join('\n')}

## Repository check scripts

These are lint gates, not conveniences — \`pnpm lint\` runs them and CI fails on them.

${table(['Script', 'Lines', 'What it enforces'], checkScripts.map((r) => [
  `\`${r.rel}\``, r.lines, clip(r.doc, 140),
]))}
${BACK(self)}`);
}

/* ── ⊗ cross/tests.md ──────────────────────────────────────────────────── */

{
  const self = 'docs/index/cross/tests.md';
  const e2e = testFiles.filter((t) => t.kind === 'e2e test');
  const unit = testFiles.filter((t) => t.kind !== 'e2e test');
  const totalCases = testFiles.reduce((n, t) => n + t.cases, 0);

  const untested = apiModuleNames.filter((n) => !testFiles.some((t) => t.module === n));

  emit(self, `${head(self, 'Tests', `**${testFiles.length}** spec files, **${fmt(totalCases)}** cases. What is already pinned down — and what is not.`)}

Run: \`pnpm test\` (turbo, all packages) · one package: \`pnpm --filter @newax/api test\`

Minimum scenarios a change should consider: normal case, invalid input,
boundary values, unauthorized access, wrong organization, wrong branch,
duplicate request, concurrent request, external service failure, partial
failure, empty state, loading state, error state.

\`any\` is allowed in \`*.spec.ts\` (partial test doubles). Production code gets no
such exemption.

## API modules with no spec file

${untested.length ? untested.map((n) => `- [\`${n}\`](${link(self, moduleFile(n))})`).join('\n') : '_None — every module has at least one spec._'}

## End-to-end (${e2e.length})

Real HTTP against a real Postgres. These are the ones that catch a permission
regression or an N+1.

${table(['Spec', 'Cases', 'Covers'], e2e.map((t) => [`\`${t.file}\``, t.cases, clip(t.describes.join(' · '), 120)]))}

## Unit and integration (${unit.length})

${table(['Spec', 'Module', 'Cases', 'Covers'], unit
  .sort((a, b) => a.file.localeCompare(b.file))
  .map((t) => [`\`${t.file}\``, t.module || t.area, t.cases, clip(t.describes.join(' · '), 100)]))}
${BACK(self)}`);
}

/** Filled by the design-system page below; also published in index.json. */
let designLaws = [];

/* ── ⊗ cross/design-system.md ──────────────────────────────────────────── */

{
  const self = 'docs/index/cross/design-system.md';

  // The chapters, read from disk so the table cannot drift from the files.
  const chapterRecords = records
    .filter((r) => DESIGN_CHAPTER_RE.test(r.rel))
    .sort((a, b) => a.base.localeCompare(b.base));

  /**
   * Every numbered law, pulled from the chapters' `### PREFIX-n · Name`
   * headings. The IDs are the citable surface of this system — a review says
   * "SPA-4", not "the thing about empty middles" — so the index has to be
   * able to resolve one to its chapter and line without opening ten files.
   */
  const LAW_RE = /^###\s+([A-Z]{3})-(\d+[a-z]?)\s+·\s+(.+?)\s*$/;
  const laws = [];
  for (const r of chapterRecords) {
    r.source.split('\n').forEach((line, i) => {
      const m = line.match(LAW_RE);
      if (m) laws.push({ family: m[1], id: `${m[1]}-${m[2]}`, name: m[3], file: r.rel, line: i + 1 });
    });
  }
  const lawFamilies = [...new Set(laws.map((l) => l.family))].sort();

  const chapters = chapterRecords.map((r) => {
    const h1 = (r.source.match(/^#\s+(.+)$/m) ?? [])[1] ?? r.base;
    const tagline = (r.source.split('\n').slice(1).find((l) => l.trim() && !l.startsWith('#')) ?? '').trim();
    const status = (r.source.match(/^>?\s*\**Status[:\s]\**\s*(.+)$/m) ?? [])[1] ?? '';
    return {
      rel: r.rel,
      base: r.base,
      title: h1.replace(/^\d+\s*·\s*/, ''),
      tagline,
      status: (status.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().split(/(?<=[.:;])\s/)[0] ?? '').trim(),
      lines: r.lines,
      headings: scanHeadings(r.source, 2).filter((h) => h.depth === 2),
    };
  });

  // ── measured reality, so a chapter that overclaims can be caught ──────
  const count = (rs, re) => rs.reduce((n, r) => n + (r.source.match(re) ?? []).length, 0);
  const webSrc = records.filter((r) => r.rel.startsWith('apps/web/src/') && isTs(r) && !isSpec(r));
  const surfaceSrc = records.filter((r) => /^apps\/(web|pos|mobile)\/src\//.test(r.rel) && isTs(r) && !isSpec(r));
  const cssRecords = records.filter((r) => r.ext === '.css');
  const tokenFiles = records.filter((r) => /^packages\/shared\/src\/theme-[a-z]+\.ts$/.test(r.rel));
  const primitives = records.filter((r) => r.rel.startsWith('apps/web/src/components/ui/') && r.ext === '.tsx');
  const motionImporters = surfaceSrc.filter((r) => (r.imports ?? []).some((i) => /^framer-motion(?:\/|$)/.test(i)));

  const TOKEN_GROUPS = [
    ['colour', 'packages/shared/src/theme-colors.ts'],
    ['radius', 'packages/shared/src/theme-radii.ts'],
    ['type', 'packages/shared/src/theme-type.ts'],
    ['space', null],
    ['size', null],
    ['shadow', null],
    ['z-index', null],
    ['motion', null],
  ];
  const tokenRows = TOKEN_GROUPS.map(([group, file]) => {
    const r = file ? byPath.get(file) : null;
    return [
      `\`${group}\``,
      r ? `\`${file}\`` : '—',
      r ? `${r.lines} lines` : '**unbuilt**',
      r ? 'exists' : 'Chapter 01 specifies it; nothing implements it',
    ];
  });

  designLaws = laws;

  const measured = [
    ['Token files', `${tokenFiles.length} (${tokenFiles.reduce((n, r) => n + r.lines, 0)} lines)`, 'Token groups that exist at all — see the table below'],
    ['Primitives', String(primitives.length), '`apps/web/src/components/ui` — the ladder\'s second rung'],
    ['`framer-motion` importers', String(motionImporters.length), motionImporters.length ? motionImporters.map((r) => `\`${r.rel}\``).join(', ') : 'installed and unused'],
    ['CSS `transition`', String(count(cssRecords, /\btransition(?:-[a-z]+)?\s*:/g)), 'declared transitions across every stylesheet'],
    ['Tailwind `transition-*` classes', String(count(surfaceSrc, /\btransition(?:-(?:all|colors|opacity|shadow|transform))?\b(?=[\s"'`])/g)), 'the actual motion surface today — utility classes, not a token'],
    ['CSS `@keyframes`', String(count(cssRecords, /@keyframes\b/g)), 'named animations'],
    ['`prefers-reduced-motion` blocks', String(count(cssRecords, /prefers-reduced-motion/g)), 'chapter 05 and 07 both require this on every motion'],
    ['`aria-*` attributes', String(count(surfaceSrc, /\saria-[a-z]+=/g)), 'written by hand; **no accessibility lint runs**'],
    ['`role=` attributes', String(count(surfaceSrc, /\srole=/g)), ''],
    ['RTL / `dir` references', String(count(surfaceSrc, /\b(?:rtl|dir=|useLocale\(\)|isRtl)\b/g)), 'Urdu ships; chapter 07 says this is scattered, not systematic'],
    ['Inline `style={{`', String(count(webSrc, /style=\{\{/g)), 'CLAUDE.md lists the legitimate exceptions — data-driven widths and colours, and the two pre-stylesheet pages'],
  ];

  emit(self, `${head(self, 'Design system', `The ${chapters.length} chapters in [\`docs/design/\`](${link(self, 'docs/design/README.md')}), and the measured state of the code they govern.`)}

This page is **generated**. The chapters are not — they are written, and they
are the document of record. What is generated here is the *evidence*: the
counts below come from the code, so a chapter claiming something the code does
not do can be caught rather than quoted.

\`\`\`bash
pnpm idx design <text>    # search every chapter
\`\`\`

## Precedence

\`CLAUDE.md\` first — the seven laws are the constitution and the design system
elaborates them, never contradicts them. Three parts of the system are already
binding and load automatically when you open a component:
\`.claude/rules/ui.md\` and \`.claude/rules/design.md\`.

## The chapters

${table(['Chapter', 'Governs', 'Status as written', 'Laws', 'Size'],
  chapters.map((c) => [
    `[${c.title}](${link(self, c.rel)})`,
    clip(c.tagline, 90),
    c.status ? clip(c.status, 110) : '—',
    laws.filter((l) => l.file === c.rel).length || '—',
    `${c.lines} lines`,
  ]))}

## The laws

**${laws.length}** numbered laws across **${lawFamilies.length}** families. Each has a stable ID so it can be
cited in a review, a commit or a PR. \`pnpm idx law <id>\` prints one.

${table(['Family', 'Laws', 'IDs'],
  lawFamilies.map((f) => {
    const own = laws.filter((l) => l.family === f);
    return [`\`${f}\``, own.length, own.map((l) => `\`${l.id}\``).join(' ')];
  }))}

<details>
<summary>Every law, by ID</summary>

${table(['ID', 'Law', 'Where'],
  laws.map((l) => [`\`${l.id}\``, l.name, `[${l.file.replace('docs/design/', '')}:${l.line}](${link(self, l.rel ?? l.file)}#${anchor(`${l.id} ${l.name}`)})`]))}

</details>

## Measured state of the code

Counted at index time by \`scripts/build-index.mjs\`, not typed by hand.

${table(['Signal', 'Today', 'Note'], measured)}

## Token groups

The ladder in chapter 03 starts at tokens. Five of the eight groups it needs
do not exist yet, which is why several chapters are specifications rather than
descriptions.

${table(['Group', 'File', 'Size', 'State'], tokenRows)}

## Outlines

${chapters.map((c) => `### [\`${c.rel}\`](${link(self, c.rel)})  <sub>${c.lines} lines</sub>\n\n${c.headings.length ? c.headings.map((h) => `- ${h.text}  <sub>:${h.line}</sub>`).join('\n') : '_no second-level headings_'}\n`).join('\n')}
${BACK(self)}`);
}

/* ── ⊗ cross/docs.md ───────────────────────────────────────────────────── */

{
  const self = 'docs/index/cross/docs.md';
  const docRecords = records.filter((r) => r.ext === '.md' || r.rel.includes('NEWAX AI Engineering'));
  const sections = docRecords
    .filter((r) => !r.rel.startsWith('docs/index/'))
    .sort((a, b) => a.rel.localeCompare(b.rel))
    .map((r) => {
      const headings = scanHeadings(r.source, 2).filter((h) => h.depth === 2);
      return `### \`${r.rel}\`  <sub>${fmt(r.lines)} lines</sub>\n\n${headings.length ? headings.map((h) => `- ${h.text}  <sub>:${h.line}</sub>`).join('\n') : '_no second-level headings_'}\n`;
    });

  emit(self, `${head(self, 'Documents of record', `**${docRecords.length}** markdown documents. These explain **why**; this index only says **where**.`)}

## Precedence

1. **\`CLAUDE.md\`** — the seven laws and the engineering protocol. Binding on every
   surface. If a detail elsewhere disagrees, the law wins.
2. **\`docs/implementation/00-HOUSE-RULES.md\`** — the long-form contract \`CLAUDE.md\`
   summarises.
3. **\`docs/implementation/RETAIL-ERP.md\`** — the document of record wherever it and
   \`ENTERPRISE-SCALE.md\` overlap.
4. Everything else, by topic.

Architectural decisions go in \`docs/implementation/decisions/\` (one file each, indexed by
\`docs/implementation/DECISIONS.md\`) — a settled decision is not reopened without new evidence.

## Outlines

${sections.join('\n')}
${BACK(self)}`);
}

/* ════════════════════════════════════════════════════════════════════════
   3. MACHINE-READABLE
   ════════════════════════════════════════════════════════════════════════ */

const json = {
  $schema: 'https://newax.invalid/repo-index/v1',
  generatedBy: 'scripts/build-index.mjs',
  note: 'Generated. Do not edit. Regenerate with `pnpm index`.',
  totals: {
    files: records.length,
    lines: records.reduce((n, r) => n + r.lines, 0),
    routes: allRoutes.length,
    controllers: controllers.length,
    models: prismaModels.length,
    enums: prismaEnums.length,
    migrations: migrations.length,
    events: eventCatalog.length,
    permissions: permissionCatalog.length,
    screens: uiRoutes.length,
    crons: crons.length,
    specs: testFiles.length,
    designLaws: designLaws.length,
  },
  // The citable surface of the design system: `idx law SPA-4` resolves here.
  designLaws: designLaws.map((l) => ({ id: l.id, family: l.family, name: l.name, file: l.file, line: l.line })),
  areas: Object.fromEntries(Object.entries(areaStats).map(([k, v]) => [k, { ...v, label: AREA_LABEL[k] }])),
  apiModules: apiModuleNames.map((name) => ({
    name,
    pack: modulePacks[name] ?? null,
    alwaysOn: featureByName.get(name)?.alwaysOn ?? false,
    inRegistry: featureByName.has(name),
    files: records.filter((r) => apiModuleOf(r.rel) === name).map((r) => r.rel),
    routes: allRoutes.filter((r) => r.module === name).length,
    page: `docs/index/modules/${name}.md`,
  })),
  apiCore: apiCoreNames.map((name) => ({
    name,
    files: records.filter((r) => apiCoreOf(r.rel) === name).map((r) => r.rel),
    page: `docs/index/core/${name}.md`,
  })),
  routes: allRoutes.map((r) => ({
    method: r.method, path: r.path, module: r.module, controller: r.controller,
    handler: r.handler, file: r.file, line: r.line, access: r.access,
    permissions: r.permissions, public: r.public, authOnly: r.authOnly, summary: r.summary,
  })),
  permissions: permissionCatalog.map((p) => ({
    ...p,
    routes: permissionUse.get(p.key).api.map((r) => `${r.method} ${r.path}`),
    uiSites: permissionUse.get(p.key).web.length,
    // ROLE_PERMISSION_SEED is the authoritative answer to "can a live user
    // hold this", and it is what cross/permissions.md already reports. An
    // earlier `inSeed` grepped seed.ts for the literal instead and disagreed
    // with that page — two answers to one question, which is the failure this
    // whole index is built to avoid.
    roles: rolesGranting(p.key),
    inSeed: rolesGranting(p.key).length > 0,
  })),
  events: eventCatalog.map((e) => ({
    symbol: e.symbol, name: e.name, doc: e.doc,
    publishers: (publishersBySymbol.get(e.symbol) ?? []).map((p) => `${p.file}:${p.line}`),
    subscribers: (subscribersBySymbol.get(e.symbol) ?? []).map((s) => `${s.file}:${s.line} ${s.handler}()`),
  })),
  models: prismaModels.map((m) => ({
    name: m.name, file: m.file, line: m.line, doc: m.doc,
    fields: m.fields.map((f) => ({ name: f.name, type: f.type, id: f.id, unique: f.unique, relation: f.relation })),
    indexes: m.indexes,
  })),
  enums: prismaEnums.map((e) => ({ name: e.name, file: e.file, line: e.line, values: e.values })),
  migrations,
  schemaMigrationDrift: drift,
  screens: uiRoutes,
  nav: navItems,
  crons,
  scripts: workspaceScripts,
  tests: testFiles.map((t) => ({ file: t.file, module: t.module, kind: t.kind, cases: t.cases, describes: t.describes })),
  files: records.map((r) => ({
    path: r.rel, area: r.area, kind: r.kind, lines: r.lines, bytes: r.bytes, doc: r.doc,
    symbols: (r.symbols ?? []).map((s) => ({ name: s.name, kind: s.kind, line: s.line })),
  })),
};
emit('docs/index/index.json', JSON.stringify(json, null, 2));

/* ════════════════════════════════════════════════════════════════════════
   4. MANIFEST, WRITE, VERIFY
   ════════════════════════════════════════════════════════════════════════ */

/**
 * A fingerprint of the index's own content.
 *
 * Deliberately NOT the git commit SHA. The pre-commit hook regenerates the
 * index before the commit exists, so a SHA here would make every freshly
 * committed index instantly "stale" by its own check — the exact failure mode
 * that teaches people to pass `--no-verify`.
 */
resolveCostMarkers();

const hash = createHash('sha256');
for (const [p, body] of [...written.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  hash.update(p).update('\0').update(body).update('\0');
}
const contentHash = hash.digest('hex').slice(0, 16);

emit('docs/index/MANIFEST.json', JSON.stringify({
  note: 'Freshness fingerprint for docs/index/. Generated; do not edit.',
  generator: 'scripts/build-index.mjs',
  contentHash,
  pages: [...written.keys()].sort(),
  totals: json.totals,
}, null, 2));

/* ── internal link integrity ───────────────────────────────────────────── */

/**
 * Every relative link between index pages must resolve.
 *
 * An index whose links are broken sends a reader to a 404 and teaches them not
 * to trust it, which costs more than the missing page. Checking here means a
 * broken link fails the build that produced it rather than surfacing months
 * later — the generator is the only thing that can create one.
 */
{
  const broken = [];
  const writtenPaths = [...written.keys()];
  for (const [page, body] of written) {
    if (!page.endsWith('.md')) continue;
    for (const m of body.matchAll(/\]\(([^)#\s]+)(?:#[^)\s]*)?\)/g)) {
      const target = m[1];
      if (/^(https?|mailto):/.test(target)) continue;
      const resolved = join(dirname(page), target).replace(/\\/g, '/');
      if (written.has(resolved)) continue;
      if (existsSync(join(ROOT, resolved))) continue;
      // A link with no file extension (e.g. `modules/`, `symbols/`) names a
      // directory this same generator populates, not a single page — its
      // contents land in `written` but the directory itself never does, and
      // on a from-scratch run (nothing on disk yet, since the actual
      // `writeFileSync` pass runs after this check) `existsSync` can't see it
      // either. Satisfied if this run wrote at least one page under it.
      if (!/\.[a-zA-Z0-9]+$/.test(target)) {
        const prefix = `${resolved.replace(/\/+$/, '')}/`;
        if (writtenPaths.some((p) => p.startsWith(prefix))) continue;
      }
      broken.push(`${page} → ${target}`);
    }
  }
  if (broken.length) {
    console.error('\nBroken internal links in the generated index:\n');
    for (const b of broken) console.error(`  ${b}`);
    console.error('\nThis is a bug in scripts/build-index.mjs, not in the repository.\n');
    process.exit(2);
  }
}

/* ── stale-file pruning ────────────────────────────────────────────────── */

/** Index pages for a module that no longer exists must not survive a rename. */
function existingIndexFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) existingIndexFiles(p, acc);
    else acc.push(relative(ROOT, p));
  }
  return acc;
}
const onDisk = existingIndexFiles(OUT_DIR);
const stale = onDisk.filter((p) => !written.has(p));

/* ── --check: compare, never write ─────────────────────────────────────── */

if (CHECK) {
  const problems = [];
  for (const [p, body] of written) {
    let current = null;
    try { current = readFileSync(join(ROOT, p), 'utf8'); } catch { /* missing */ }
    if (current === null) problems.push(`missing:  ${p}`);
    else if (current !== body) problems.push(`outdated: ${p}`);
  }
  for (const p of stale) problems.push(`stale:    ${p}`);

  if (problems.length) {
    console.error('\ndocs/index/ is out of date with the working tree:\n');
    for (const p of problems.slice(0, 40)) console.error(`  ${p}`);
    if (problems.length > 40) console.error(`  … and ${problems.length - 40} more`);
    console.error('\nRun `pnpm index` and commit the result.');
    console.error('If this fired in a commit, the pre-commit hook is not installed:');
    console.error('  node scripts/install-git-hooks.mjs\n');
    process.exit(1);
  }
  console.log(`docs/index/ is current (${written.size} pages, ${contentHash}).`);
  process.exit(0);
}

/* ── write ─────────────────────────────────────────────────────────────── */

let changed = 0;
for (const [p, body] of written) {
  const abs = join(ROOT, p);
  let current = null;
  try { current = readFileSync(abs, 'utf8'); } catch { /* new file */ }
  if (current === body) continue;
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body, 'utf8');
  // A generated hook that is not executable is a hook that silently never
  // runs, and nothing else in the pipeline would notice.
  if (p.endsWith('.sh')) chmodSync(abs, 0o755);
  changed += 1;
}
for (const p of stale) {
  rmSync(join(ROOT, p), { force: true });
  log(`  removed stale ${p}`);
}

log(`\nIndex written: ${written.size} pages (${changed} changed, ${stale.length} removed) · ${contentHash}`);
log(`  ${fmt(records.length)} files · ${fmt(json.totals.lines)} lines · ${allRoutes.length} routes · ${prismaModels.length} models · ${eventCatalog.length} events · ${permissionCatalog.length} permissions`);
log(`  Entry point: docs/index/README.md`);

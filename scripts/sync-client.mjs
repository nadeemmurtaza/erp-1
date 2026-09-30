#!/usr/bin/env node
// scripts/sync-client.mjs — the Extractor.
//
// Spec: docs/implementation/commercial-licensing-agency/12-extractor-script-spec.md
// Architecture ("why"): docs/implementation/commercial-licensing-agency/11-client-handover-model.md
//
// Creates (--repo=new) or upgrades (--repo=<git url>) a standalone client
// repository out of this Blueprint: copies the core engine and only the
// requested module packs, uses ts-morph (not regex) to remove every
// unrequested module from apps/api/src/modules/modules.registry.ts with
// zero broken imports, prunes the Prisma schema and migration history to
// the client's own subset, protects the client's bespoke storefront and
// white-label branding from being overwritten on an upgrade (11's
// "Engine vs. Glass" boundary), and scaffolds a tailored .env.example.
//
// SAFETY — the one non-negotiable rule this script is built around:
// Every phase through creating the commit runs by default, entirely inside
// this script's own isolated `.client-build` working directory. This
// repository's own git state is never touched by any of it. The one step
// that reaches OUTSIDE this repository — `git push` to what may be a real
// client's real remote — never runs unless the caller passes
// --confirm-push. Its absence is the safe default: the script still runs
// every other phase, commits locally, and prints the exact push command a
// human would run themselves, then exits 0. There is no opt-out "dry run"
// flag here — pushing is opt-IN, not opt-OUT.
//
//   node scripts/sync-client.mjs --repo=<url|new> --modules=<pack1,pack2,...> [--confirm-push]
//   node scripts/sync-client.mjs --help
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import crypto from 'crypto';
import { Project, SyntaxKind } from 'ts-morph';

const HELP = `Usage: node scripts/sync-client.mjs --repo=<url|new> --modules=<pack1,pack2,...> [--confirm-push]

Creates or upgrades a standalone client repository from this Blueprint,
containing only the requested module packs (docs/implementation/commercial-licensing-agency/12-extractor-script-spec.md).

  --repo=<url>      The client's existing git repository — an upgrade sync.
                     The Admin Panel and the API are refreshed; the client's
                     storefront and white-label branding are left untouched.
  --repo=new        No client repository exists yet — a fresh delivery.
                     The storefront Starter Template is copied too.
  --modules=<list>  Comma-separated purchased modules, e.g. catalog,cart,orders.
                     Validated against apps/api/src/modules/module-packs.ts.
                     A module the app cannot boot without (alwaysOn in
                     modules.registry.ts, e.g. settings/users/addresses)
                     ships regardless of this list.
  --confirm-push    Actually push the resulting commit to the client's
                     remote and (on an upgrade) print PR instructions.
                     WITHOUT this flag the script still does every other
                     phase — including creating the commit locally inside
                     .client-build/ — and instead prints the exact
                     \`git push\` command to run by hand. Nothing is ever
                     pushed anywhere by default.
  --help, -h        Show this message.

Examples:
  node scripts/sync-client.mjs --repo=new --modules=catalog,cart,orders,payments,stitching
  node scripts/sync-client.mjs --repo=git@github.com:client/shop.git --modules=catalog,cart,orders
  node scripts/sync-client.mjs --repo=git@github.com:client/shop.git --modules=catalog,cart,orders --confirm-push

'core' is never itself a --modules entry: apps/api/src/core/ and
packages/shared/ ship unconditionally on every delivery (Phase 2's "Core
Transfer"), the same way settings/users/addresses always do as
alwaysOn modules.
`;

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

const repoArg = args.find(a => a.startsWith('--repo='))?.split('=')[1];
const modulesArg = args.find(a => a.startsWith('--modules='))?.split('=')[1];
const confirmPush = args.includes('--confirm-push');

if (!repoArg || !modulesArg) {
  console.error('Usage: node scripts/sync-client.mjs --repo=<url|new> --modules=<pack1,pack2> [--confirm-push]');
  console.error('Run with --help for the full description of every flag.');
  process.exit(1);
}

const requestedModules = modulesArg.split(',').map(m => m.trim()).filter(Boolean);
// Deliberately OUTSIDE this repository's own directory tree — an OS temp
// directory, not repo-root-relative — and not merely for tidiness. Prisma's
// CLI walks UP from wherever --schema points, looking for the nearest
// package.json, to decide whether the right `prisma` version is installed;
// found nested inside the Blueprint, that walk reaches the Blueprint's own
// root package.json, sees no `prisma` devDependency there (only apps/api
// has one), and silently runs `pnpm add prisma@<version> -D` against THIS
// repository to "fix" it — mutating pnpm-lock.yaml. Confirmed by hitting it
// during this script's own development; see this file's status note in
// 12-extractor-script-spec.md. Living in os.tmpdir() means no ancestor
// package.json exists for that walk to ever find, so it can never trigger,
// independent of whatever else Prisma's CLI decides to auto-heal in a
// future version.
const BUILD_DIR = path.join(os.tmpdir(), '.client-build');
const BLUEPRINT_DIR = path.resolve('.');

// Prisma schema files with no owning pack at all — the generator/datasource
// block and the User/Address/etc core tables, plus the replication engine,
// whose own header calls it "core platform, not a module, the same standing
// as core/events/". Every deployment needs these regardless of which sector
// packs it requested, the same way apps/api/src/core/ ships unconditionally.
const ALWAYS_ON_SCHEMA_FILES = ['core', 'schema', 'replication'];

// Phase 1: Initialization & validation
console.log('--- Phase 1: Initialization ---');

const modulePacksPath = path.join(BLUEPRINT_DIR, 'apps/api/src/modules/module-packs.ts');
const validationProject = new Project();
const modulePacksSource = validationProject.addSourceFileAtPath(modulePacksPath);
const modulePacksDecl = modulePacksSource.getVariableDeclaration('MODULE_PACKS');
const modulePacksInitializer = modulePacksDecl?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
const modulePacksProps = (modulePacksInitializer?.getProperties() ?? [])
  .filter(p => p.getKind() === SyntaxKind.PropertyAssignment);
const validModules = modulePacksProps.map(p => p.getName().replace(/['"]/g, ''));
// Which sector pack ('core', 'apparel', ...) each module belongs to — this
// is the real, coarser granularity the Prisma schema can actually be pruned
// at (see the Prisma Scaffolding comment in Phase 2 for why).
const modulePackOf = Object.fromEntries(
  modulePacksProps.map(p => [
    p.getName().replace(/['"]/g, ''),
    p.getInitializer()?.getText().replace(/['"]/g, ''),
  ]),
);

const unknownModules = requestedModules.filter(m => !validModules.includes(m));
if (unknownModules.length > 0) {
  console.error('Unknown module(s) requested: ' + unknownModules.join(', '));
  console.error('Known modules: ' + validModules.join(', '));
  process.exit(1);
}

// Modules the app cannot boot without (alwaysOn in modules.registry.ts) ship
// regardless of what the client purchased.
const registrySource = validationProject.addSourceFileAtPath(
  path.join(BLUEPRINT_DIR, 'apps/api/src/modules/modules.registry.ts'),
);
const featureModulesDecl = registrySource.getVariableDeclaration('FEATURE_MODULES');
const featureModulesArray = featureModulesDecl?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
const alwaysOnModules = (featureModulesArray?.getElements() ?? [])
  .filter(el => el.getKind() === SyntaxKind.ObjectLiteralExpression)
  .filter(el => {
    const alwaysOnProp = el.getProperty('alwaysOn');
    return alwaysOnProp?.getInitializer()?.getText() === 'true';
  })
  .map(el => el.getProperty('name')?.getInitializer()?.getText().replace(/['"]/g, ''))
  .filter(Boolean);

// A requested module that is a SOURCE in scripts/check-module-boundaries.mjs's
// own KNOWN_MODULE_COUPLINGS list has a hard, same-transaction import into
// its target module's .module/.service (e.g. catalog.module.ts imports
// InventoryModule directly, for product-admin.service.ts's transactional
// stock write) — that import ships with catalog's own code regardless of
// --modules, so the target has to ship too or the client's build breaks on
// a dangling import. Confirmed empirically: an early version of this script
// let `--modules=catalog` through without `inventory` and `tsc --noEmit`
// caught the exact resulting "Cannot find module '../inventory/inventory.module'"
// error — see this file's status note in 12-extractor-script-spec.md. Read
// live from check-module-boundaries.mjs's own source (never duplicated here)
// so the two can never drift out of sync; folded in to a fixed point since a
// pulled-in target can itself be a source (e.g. orders -> inventory and
// purchasing -> inventory both feed the same closure).
const boundariesScriptSrc = fs.readFileSync(path.join(BLUEPRINT_DIR, 'scripts/check-module-boundaries.mjs'), 'utf8');
const couplingsBlock = boundariesScriptSrc.match(/const KNOWN_MODULE_COUPLINGS = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? '';
const couplingTargetsOf = {};
for (const [, source, target] of couplingsBlock.matchAll(/'([\w-]+) -> ([\w-]+)'/g)) {
  (couplingTargetsOf[source] ??= new Set()).add(target);
}

const effectiveModulesSet = new Set([...requestedModules, ...alwaysOnModules]);
for (let changed = true; changed; ) {
  changed = false;
  for (const mod of [...effectiveModulesSet]) {
    for (const target of couplingTargetsOf[mod] ?? []) {
      if (!effectiveModulesSet.has(target)) {
        effectiveModulesSet.add(target);
        changed = true;
        console.log(`Adding '${target}' — required by the same-transaction coupling '${mod} -> ${target}' (KNOWN_MODULE_COUPLINGS).`);
      }
    }
  }
}
const effectiveModules = [...effectiveModulesSet];

// packages/shared ships as TypeScript SOURCE into .client-build (Phase 2's
// "Core Transfer"), but @newax/shared itself resolves through its own
// package.json's `main`/`types`, both pointed at ./dist — built output, not
// source. Phase 3b's `tsc --noEmit` needs that dist/ to exist to resolve
// every core/module file that imports @newax/shared (nearly all of them),
// the same way turbo's own build pipeline builds packages before an app's
// typecheck runs; built here explicitly since this script calls `tsc`
// directly, outside that pipeline. Idempotent and harmless to run again —
// packages/shared/dist is generated output, already git-ignored.
const sharedDistEntry = path.join(BLUEPRINT_DIR, 'packages/shared/dist/index.d.ts');
if (!fs.existsSync(sharedDistEntry)) {
  console.log('packages/shared has not been built yet (needed for Phase 3b\'s tsc validation) — building it now...');
  execSync('pnpm --filter @newax/shared build', { cwd: BLUEPRINT_DIR, stdio: 'inherit' });
}

if (fs.existsSync(BUILD_DIR)) {
  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
}

if (repoArg === 'new') {
  fs.mkdirSync(BUILD_DIR);
  execSync('git init', { cwd: BUILD_DIR, stdio: 'inherit' });
} else {
  execSync(`git clone ${repoArg} ${BUILD_DIR}`, { stdio: 'inherit' });
}

// A commit identity scoped to this one build directory only (never --global,
// never the Blueprint's own repo config) so Phase 7's `git commit` never
// fails for lack of one, regardless of what's configured in whatever
// environment this script happens to run in.
execSync('git config user.name "Newax Extractor"', { cwd: BUILD_DIR, stdio: 'inherit' });
execSync('git config user.email "extractor@newax.invalid"', { cwd: BUILD_DIR, stdio: 'inherit' });

// Phase 2: Engine Extraction (Backend)
console.log('--- Phase 2: Engine Extraction ---');
const copyDir = (src, dest, ignorePatterns = []) => {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (ignorePatterns.includes(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, ignorePatterns);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

// Copy Core
copyDir(path.join(BLUEPRINT_DIR, 'apps/api/src/core'), path.join(BUILD_DIR, 'apps/api/src/core'));
copyDir(path.join(BLUEPRINT_DIR, 'packages'), path.join(BUILD_DIR, 'packages'), ['node_modules']);
// module-packs.ts sits directly under src/modules/ (a sibling of the
// per-module folders, not inside one), holding pack-catalog metadata for
// EVERY module the Blueprint knows about — not what this delivery enables,
// which is modules.registry.ts's job (handled in Phase 3). It ships
// unconditionally because core code depends on it directly: confirmed
// empirically — core/config/meta.controller.ts imports it, and a delivery
// missing it fails to compile regardless of which modules were requested.
const modulePacksFileSrc = path.join(BLUEPRINT_DIR, 'apps/api/src/modules/module-packs.ts');
if (fs.existsSync(modulePacksFileSrc)) {
  fs.mkdirSync(path.join(BUILD_DIR, 'apps/api/src/modules'), { recursive: true });
  fs.copyFileSync(modulePacksFileSrc, path.join(BUILD_DIR, 'apps/api/src/modules/module-packs.ts'));
}

// Modules live at src/modules/<domain>/<name>/. The domain is only a grouping
// folder; every other part of this script, like MODULE_PACKS and the MODULES
// allowlist, knows a module by its bare NAME. This finds each name's domain.
function moduleDomains(modulesDir) {
  const domains = new Map(); // module name -> domain folder name
  if (!fs.existsSync(modulesDir)) return domains;
  for (const domain of fs.readdirSync(modulesDir, { withFileTypes: true })) {
    if (!domain.isDirectory()) continue;
    for (const mod of fs.readdirSync(path.join(modulesDir, domain.name), { withFileTypes: true })) {
      if (mod.isDirectory()) domains.set(mod.name, domain.name);
    }
  }
  return domains;
}
const blueprintDomains = moduleDomains(path.join(BLUEPRINT_DIR, 'apps/api/src/modules'));

// Targeted Copy of Modules (requested modules plus anything the app cannot boot without)
for (const mod of effectiveModules) {
  const domain = blueprintDomains.get(mod);
  const modSrc = domain && path.join(BLUEPRINT_DIR, 'apps/api/src/modules', domain, mod);
  if (modSrc && fs.existsSync(modSrc)) {
    copyDir(modSrc, path.join(BUILD_DIR, 'apps/api/src/modules', domain, mod));
  } else {
    console.warn('Warning: Requested module ' + mod + ' not found in Blueprint.');
  }
}

// Active Pruning — never touches an always-on module
const clientModulesDir = path.join(BUILD_DIR, 'apps/api/src/modules');
if (fs.existsSync(clientModulesDir)) {
  for (const [mod, domain] of moduleDomains(clientModulesDir)) {
    if (!effectiveModules.includes(mod)) {
      console.log('Pruning unrequested module: ' + mod);
      fs.rmSync(path.join(clientModulesDir, domain, mod), { recursive: true, force: true });
    }
  }
  // A domain folder left empty by pruning carries nothing; drop it.
  for (const domain of fs.readdirSync(clientModulesDir, { withFileTypes: true })) {
    const dir = path.join(clientModulesDir, domain.name);
    if (domain.isDirectory() && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  }
}

// Prisma Scaffolding — core.prisma/schema.prisma/replication.prisma ship
// unconditionally (ALWAYS_ON_SCHEMA_FILES); everything else ships only for
// a requested SECTOR PACK, not per requested module. Confirmed empirically
// (see 12-extractor-script-spec.md's status note): core.prisma's own `User`
// model carries real, two-sided Prisma relations into nearly every module
// classified pack:'core' in module-packs.ts (payroll, marketing, loyalty,
// giftcards, reviews, wishlist, content, fulfilment, notification-preferences,
// and more — 79 distinct model types on a `catalog,cart`-only attempt).
// Prisma validates every file in a schema FOLDER as one merged schema, so
// any one of those relations left without its target model present fails
// `prisma generate` outright. `MODULE_PACKS` itself explains why this is
// correct, not a bug to paper over: pack:'core' is "the universal commerce
// core ... what every shop needs" — the true prunable boundary in this
// schema is the SECTOR axis (core vs. apparel vs. a future pharmacy/etc.),
// exactly what `checkPrismaBoundaries()` in check-module-boundaries.mjs
// already enforces (a same-pack relation is never a violation). Any
// individual module inside the requested pack(s) still governs Phase 3's
// NestJS registration; it just cannot additionally prune the schema below
// its pack, because the schema was never built to be modular at that finer
// grain. A `.prisma` file with no exact module-name match (approvals,
// invoicing, replication, whatsapp-assistant, onsite-messaging,
// trading-partners) defaults to pack 'core' — every sector pack that exists
// in this repository today (only 'apparel') has its files named exactly
// after its two modules, so this default is evidence-based, not a guess;
// a future sector pack whose file names diverge from its module names would
// need a real, named entry here instead of silently relying on it.
const prismaSrc = path.join(BLUEPRINT_DIR, 'apps/api/prisma/schema');
const prismaDest = path.join(BUILD_DIR, 'apps/api/prisma/schema');
fs.mkdirSync(prismaDest, { recursive: true });

const requestedPacks = new Set(effectiveModules.map((mod) => modulePackOf[mod]).filter(Boolean));
// KNOWN, TRACKED architectural debt, not an Extractor bug: cart.prisma
// (pack:'core', so always present — every client has a cart) carries one
// real Prisma relation into the apparel pack, CartItemStitchingOption.option
// -> StitchingOption — already the sole entry in
// scripts/check-module-boundaries.mjs's own KNOWN_SCHEMA_VIOLATIONS
// burn-down list, not something this script invented or is silently
// working around. Until that debt is paid off, apparel's schema has to ship
// with every delivery regardless of --modules, or cart's own schema fails
// to compile — confirmed empirically (see this file's own status note in
// 12-extractor-script-spec.md). Remove this override the same day that
// entry is removed from KNOWN_SCHEMA_VIOLATIONS.
requestedPacks.add('apparel');
const packOfSchemaFile = (base) => modulePackOf[base] ?? 'core';

for (const base of ALWAYS_ON_SCHEMA_FILES) {
  const p = path.join(prismaSrc, base + '.prisma');
  if (fs.existsSync(p)) {
    fs.copyFileSync(p, path.join(prismaDest, base + '.prisma'));
  }
}
const allSchemaBasenames = fs.existsSync(prismaSrc)
  ? fs.readdirSync(prismaSrc, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.prisma'))
      .map((e) => e.name.slice(0, -'.prisma'.length))
      .filter((base) => !ALWAYS_ON_SCHEMA_FILES.includes(base))
  : [];
for (const base of allSchemaBasenames) {
  if (requestedPacks.has(packOfSchemaFile(base))) {
    fs.copyFileSync(path.join(prismaSrc, base + '.prisma'), path.join(prismaDest, base + '.prisma'));
  }
}

// Prune stale schema files a previous, broader delivery left behind (e.g. an
// apparel-pack file, if apparel was requested before but isn't now) — the
// prisma-file equivalent of the module-folder Active Pruning above.
if (fs.existsSync(prismaDest)) {
  for (const entry of fs.readdirSync(prismaDest, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.prisma')) continue;
    const base = entry.name.slice(0, -'.prisma'.length);
    if (ALWAYS_ON_SCHEMA_FILES.includes(base)) continue;
    if (!requestedPacks.has(packOfSchemaFile(base))) {
      console.log('Pruning stale schema file: ' + entry.name);
      fs.rmSync(path.join(prismaDest, entry.name));
    }
  }
}

// Validation — prove the pruned schema actually compiles, not just that the
// copy loop above ran. Runs the Blueprint's own pinned `prisma` binary
// (apps/api/node_modules/.bin/prisma, matching apps/api/package.json's
// pinned version) against the COPY inside .client-build: schema.prisma's
// `generator client { output = "../../src/generated/prisma" }` is resolved
// relative to the schema folder, not to cwd, so the generated client lands
// inside .client-build and this never touches the Blueprint's own
// apps/api/src/generated/prisma.
//
// Two real, empirically-confirmed hazards this step has to defuse, not just
// a plain `prisma generate` call — see this file's status note in
// 12-extractor-script-spec.md for how each was found:
//   1. Prisma's CLI resolves `@prisma/client` relative to the SCHEMA
//      directory's own ancestry, not cwd — confirmed by direct reproduction,
//      not assumed. .client-build has no node_modules of its own (a client
//      repo installs its own dependencies; this script never runs `install`
//      inside .client-build), so resolution fails unless one is reachable
//      from there. A temporary node_modules symlink into the Blueprint's own
//      apps/api/node_modules supplies it without ever copying or committing
//      a node_modules tree. Phase 3b's `tsc` needs the exact same symlink
//      (to resolve @nestjs/common and friends) AND the client this step
//      generates (core/ai/ai.service.ts and others import enum types straight
//      off the generated Prisma client), so both stay alive across Phase 2b
//      AND Phase 3b and are torn down together, right after Phase 3b, by
//      cleanupValidationArtifacts() below — never before both have run.
//   2. When resolution fails outright, Prisma's CLI falls back to silently
//      running `pnpm add`/`npm i` to "fix" the nearest ancestor package.json
//      it can find. With .client-build living inside this repository's own
//      tree (an earlier version of this script), that ancestor was this
//      repository's OWN root package.json — this is what actually rewrote
//      this repository's pnpm-lock.yaml once during development (reverted
//      before committing). PRISMA_GENERATE_SKIP_AUTOINSTALL=true disables
//      that fallback outright, as defense in depth on top of BUILD_DIR now
//      living in os.tmpdir() (see BUILD_DIR's own comment) — belt and
//      braces, since hazard 2 only became visible by way of hazard 1.
console.log('--- Phase 2b: Prisma schema validation (`prisma generate`) ---');
const prismaBin = path.join(BLUEPRINT_DIR, 'apps/api/node_modules/.bin/prisma');
const tscBin = path.join(BLUEPRINT_DIR, 'node_modules/.bin/tsc');
const blueprintApiNodeModules = path.join(BLUEPRINT_DIR, 'apps/api/node_modules');
if (!fs.existsSync(prismaBin) || !fs.existsSync(blueprintApiNodeModules) || !fs.existsSync(tscBin)) {
  console.error('Cannot validate: the Blueprint\'s own node_modules is incomplete. Run `pnpm install` in the Blueprint first.');
  process.exit(1);
}
const clientNodeModulesLink = path.join(BUILD_DIR, 'apps/api/node_modules');
fs.symlinkSync(blueprintApiNodeModules, clientNodeModulesLink, 'dir');
function cleanupValidationArtifacts() {
  // The temporary resolution symlink — never shipped to the client, whose
  // own `pnpm install` builds a real one.
  fs.rmSync(clientNodeModulesLink, { force: true });
  // The generated client itself is a validation artifact, not something the
  // client's repository should ship pre-built — the standard Prisma workflow
  // (matching this Blueprint's own .gitignore) is to git-ignore it and
  // regenerate on install, not commit query-engine binaries.
  fs.rmSync(path.join(BUILD_DIR, 'apps/api/src/generated'), { recursive: true, force: true });
  // Phase 3b's temporary tsconfig.json copy — see that phase's own comment
  // for why this is a validation artifact today, not yet a shipped
  // scaffolding file.
  fs.rmSync(path.join(BUILD_DIR, 'apps/api/tsconfig.json'), { force: true });
}
try {
  execSync(`"${prismaBin}" generate --schema="${prismaDest}"`, {
    cwd: path.join(BLUEPRINT_DIR, 'apps/api'),
    stdio: 'inherit',
    env: { ...process.env, PRISMA_GENERATE_SKIP_AUTOINSTALL: 'true' },
  });
  console.log('prisma generate: PASSED — the pruned schema compiles with zero broken cross-pack relations.');
} catch {
  console.error(
    `prisma generate: FAILED. The pruned schema for [${effectiveModules.join(', ')}] does not compile — see the error above.`,
  );
  console.error("This usually means a requested module's schema file has a relation field into a pack that was not copied.");
  cleanupValidationArtifacts();
  process.exit(1);
}

// Phase 3: AST Modification
console.log('--- Phase 3: AST Modification (TypeScript) ---');
const project = new Project();
const registryFileSrc = path.join(BLUEPRINT_DIR, 'apps/api/src/modules/modules.registry.ts');
const registryFileDest = path.join(BUILD_DIR, 'apps/api/src/modules/modules.registry.ts');

if (fs.existsSync(registryFileSrc)) {
  fs.copyFileSync(registryFileSrc, registryFileDest);
  const sourceFile = project.addSourceFileAtPath(registryFileDest);

  // Remove Imports for anything not shipped (effectiveModules covers alwaysOn too)
  const imports = sourceFile.getImportDeclarations();
  imports.forEach(imp => {
    const moduleSpecifier = imp.getModuleSpecifierValue();
    if (moduleSpecifier.startsWith('./')) {
      // './<domain>/<name>/<file>' — the module name is the third segment.
      // A two-segment specifier ('./module-packs') keeps its old meaning.
      const parts = moduleSpecifier.split('/');
      const moduleName = parts.length >= 4 ? parts[2] : parts[1];
      if (moduleName && !effectiveModules.includes(moduleName)) {
        imp.remove();
      }
    }
  });

  // Remove from FEATURE_MODULES array
  const varDecl = sourceFile.getVariableDeclaration('FEATURE_MODULES');
  if (varDecl) {
    const arrayLiteral = varDecl.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
    if (arrayLiteral) {
      const elements = arrayLiteral.getElements();
      elements.forEach(element => {
        if (element.getKind() === SyntaxKind.ObjectLiteralExpression) {
          const prop = element.getProperty('name');
          if (prop) {
            const val = prop.getInitializer()?.getText().replace(/['"]/g, '');
            if (val && !effectiveModules.includes(val)) {
              arrayLiteral.removeElement(element);
            }
          }
        }
      });
    }
  }
  sourceFile.saveSync();

  // Validation — prove the AST edit produced valid, compilable TypeScript,
  // not just that ts-morph ran without throwing. A dangling import (removed
  // late, or a FEATURE_MODULES entry left referencing a name whose import
  // WAS removed) is exactly the class of bug regex editing would risk and
  // ts-morph is supposed to prevent; this is what actually proves it did.
  //
  // Runs the REAL apps/api/tsconfig.json, copied as-is into .client-build
  // (removed again by cleanupValidationArtifacts() below — it is a
  // validation artifact, not yet a scaffolding file this script ships; see
  // this file's status note in 12-extractor-script-spec.md for that
  // separate, named gap), rather than a hand-rolled set of compiler flags.
  // A hand-rolled `--moduleResolution bundler` (to resolve @newax/shared's
  // package.json "exports" map some other way) was tried first and
  // rejected: it silently changed real narrowing behaviour on unrelated,
  // already-correct code (a discriminated-union check in
  // easypaisa.provider.ts that `pnpm typecheck` passes cleanly today),
  // which would have made this validation step less trustworthy, not more.
  // The real tsconfig already has its own answer to that exact resolution
  // problem — a `paths` alias, with its own comment explaining why — so
  // reusing it is both simpler and correct by construction. It also means
  // this step checks the WHOLE copied `src/**/*` tree (the tsconfig's own
  // `include`), not just modules.registry.ts's reachable subset — strictly
  // more thorough, at no extra cost.
  console.log('--- Phase 3b: TypeScript validation (`tsc --noEmit`) ---');
  const clientTsconfigPath = path.join(BUILD_DIR, 'apps/api/tsconfig.json');
  fs.copyFileSync(path.join(BLUEPRINT_DIR, 'apps/api/tsconfig.json'), clientTsconfigPath);
  try {
    execSync(`"${tscBin}" --noEmit -p "${clientTsconfigPath}"`, { cwd: BLUEPRINT_DIR, stdio: 'inherit' });
    console.log('tsc --noEmit: PASSED — the copied apps/api tree, with only the requested modules registered, typechecks cleanly.');
  } catch {
    console.error('tsc --noEmit: FAILED. See the error above.');
    console.error('This usually means an import or a FEATURE_MODULES entry was left dangling by the AST edit above.');
    cleanupValidationArtifacts();
    process.exit(1);
  }
} else {
  console.warn('Warning: modules.registry.ts not found in Blueprint — skipping AST modification.');
}
cleanupValidationArtifacts();

// Phase 4: Glass Protection
console.log('--- Phase 4: Glass Protection ---');
copyDir(path.join(BLUEPRINT_DIR, 'apps/web/src/app/(admin)'), path.join(BUILD_DIR, 'apps/web/src/app/(admin)'));
if (repoArg === 'new') {
  copyDir(path.join(BLUEPRINT_DIR, 'apps/web/src/app/(storefront)'), path.join(BUILD_DIR, 'apps/web/src/app/(storefront)'));
  // No apps/web/theme.config.ts (or equivalent) exists in this Blueprint
  // today — branding is resolved through packages/shared/src/brand.ts
  // (Law 1), which Phase 2's "Core Transfer" already copies unconditionally
  // and Phase 4 never touches on an upgrade. This copy is a no-op via
  // copyDir's own existsSync guard until such a file exists; kept, rather
  // than deleted, so the day a white-label config file is added it is
  // ignore-protected here with zero further changes to this script.
  if (fs.existsSync(path.join(BLUEPRINT_DIR, 'apps/web/theme.config.ts'))) {
    fs.copyFileSync(path.join(BLUEPRINT_DIR, 'apps/web/theme.config.ts'), path.join(BUILD_DIR, 'apps/web/theme.config.ts'));
  }
}

// Phase 5: IaaS & Environment
console.log('--- Phase 5: IaaS Scaffolding ---');

/**
 * Tailors the root .env.example to what this client actually has installed,
 * read live from the Blueprint's own .env.example rather than duplicated
 * here, so a change to the real template is never re-typed in two places.
 *
 * Kept unconditionally: the header banner and every base/infrastructure
 * paragraph — database, API, auth, topology, storage, notification
 * channels, email/WhatsApp/SMS transport, seed admin, web. Dropped or kept
 * per delivery:
 *   - PAYMENT_PROVIDERS / JazzCash / Easypaisa — kept only if 'payments' is
 *     in this delivery.
 *   - Giftkarta — kept only if 'giftcards' is in this delivery.
 *   - nID identity verification — kept only if 'identity-verification' is.
 *   - "Platform control plane" (PLATFORM_*) — always dropped: those vars
 *     belong to apps/platform, which this Extractor never ships to a client
 *     (see 11-client-handover-model.md's own IaaS section — a client is
 *     either self-hosted or a tenant OF the platform, never the platform).
 *   - MODULES and its "# Available:" comment are rewritten to exactly this
 *     delivery's module set — anything else no longer physically exists in
 *     the client's own repository.
 */
function buildEnvExample(modules) {
  const rootPath = path.join(BLUEPRINT_DIR, '.env.example');
  if (!fs.existsSync(rootPath)) {
    console.warn('Warning: .env.example not found in Blueprint — writing a minimal fallback.');
    return `DATABASE_URL="postgresql://user:password@host:5432/db?schema=public"\nMODULES="${modules.join(',')}"\n`;
  }
  const raw = fs.readFileSync(rootPath, 'utf8');
  const paragraphs = raw.split(/\n{2,}/);
  const dropUnless = (text, needle, mod) => text.includes(needle) && !modules.includes(mod);

  const kept = paragraphs
    .filter((p) => {
      if (p.includes('PLATFORM_')) return false;
      if (dropUnless(p, 'JAZZCASH_', 'payments')) return false;
      if (dropUnless(p, 'EASYPAISA_', 'payments')) return false;
      if (dropUnless(p, 'PAYMENT_PROVIDERS', 'payments')) return false;
      if (dropUnless(p, 'GIFTKARTA_', 'giftcards')) return false;
      if (dropUnless(p, 'NID_', 'identity-verification')) return false;
    if (dropUnless(p, 'AGENCY_API_URL', 'managed-services')) return false;
      return true;
    })
    .map((p) => {
      if (!p.includes('MODULES=')) return p;
      return p
        .replace(/^# Available:.*$/m, '# Available (this delivery): ' + modules.join(','))
        .replace(/^MODULES=".*"$/m, `MODULES="${modules.join(',')}"`);
    });

  return kept.join('\n\n') + '\n';
}

let envContent = buildEnvExample(effectiveModules);
if (requestedModules.includes('managed-services')) {
  const apiKey = crypto.randomBytes(32).toString('hex');
  envContent += `\n# --- Managed services (agency-hosted billing dashboard) -------------------\nAGENCY_API_KEY="${apiKey}"\n`;
  console.log('>>> [ACTION REQUIRED] Register this API Key for the client in the Master Database: ' + apiKey);
}
fs.writeFileSync(path.join(BUILD_DIR, '.env.example'), envContent);
console.log('Wrote .env.example tailored to: ' + effectiveModules.join(', '));

// Phase 6: CI/CD & Database Cleanup
console.log('--- Phase 6: CI/CD & Database Cleanup ---');
// Only a fresh delivery has no live database behind it. Purging migrations on
// an UPGRADE would strip an existing client's migration history against a
// database that already has data in it — the next `prisma migrate deploy`
// would have nothing to reconcile against. Upgrades keep whatever migration
// history the client repo already has; new schema changes need a real
// incremental migration, not a wipe-and-regenerate.
if (repoArg === 'new') {
  const migrationsDir = path.join(BUILD_DIR, 'apps/api/prisma/schema/migrations');
  if (fs.existsSync(migrationsDir)) {
    fs.rmSync(migrationsDir, { recursive: true, force: true });
  }
} else {
  console.log('Upgrade sync — leaving the client\'s existing migration history untouched.');
}
// Seed runner — copied as-is; the Blueprint does not yet split seeds per
// module (12-extractor-script-spec.md assumes apps/api/prisma/seeds/*.seed.ts;
// this repo's actual seeding is one monolithic apps/api/prisma/seed.ts, so
// there is nothing to filter per requested module here today).
const seedFileSrc = path.join(BLUEPRINT_DIR, 'apps/api/prisma/seed.ts');
if (fs.existsSync(seedFileSrc)) {
  fs.mkdirSync(path.join(BUILD_DIR, 'apps/api/prisma'), { recursive: true });
  fs.copyFileSync(seedFileSrc, path.join(BUILD_DIR, 'apps/api/prisma/seed.ts'));
}
const githubDir = path.join(BUILD_DIR, '.github/workflows');
if (fs.existsSync(githubDir)) {
  fs.rmSync(githubDir, { recursive: true, force: true });
}
// A client repository with no .gitignore of its own would happily commit
// node_modules, dist/, .env, and a freshly `prisma generate`-d client's
// binary query engines the moment real development starts there. Not named
// in 12-extractor-script-spec.md's own Phase 6, but a direct, minimal
// consequence of "the client receives a pristine, perfectly tailored
// repository" (11-client-handover-model.md) — only written on a fresh
// delivery, never overwritten on an upgrade (Phase 4's same Glass-protection
// reasoning: it may already have been hand-edited).
if (repoArg === 'new') {
  const gitignoreSrc = path.join(BLUEPRINT_DIR, '.gitignore');
  if (fs.existsSync(gitignoreSrc)) {
    fs.copyFileSync(gitignoreSrc, path.join(BUILD_DIR, '.gitignore'));
  }
}

// Phase 7: Delivery & Pull Request
console.log('--- Phase 7: Delivery Ready ---');
if (repoArg !== 'new') {
  // A full timestamp, not just the date, so two syncs run the same day never
  // collide on the same remote branch name — running this script twice
  // against the same target with the same module list must not corrupt or
  // duplicate a pushed branch.
  const branchName = 'platform-sync-' + new Date().toISOString().replace(/[:.]/g, '-');
  execSync('git checkout -b ' + branchName, { cwd: BUILD_DIR, stdio: 'inherit' });
  execSync('git add .', { cwd: BUILD_DIR, stdio: 'inherit' });

  let committed = true;
  try {
    execSync(`git commit -m "chore: platform sync (modules: ${effectiveModules.join(', ')})"`, {
      cwd: BUILD_DIR,
      stdio: 'inherit',
    });
  } catch {
    committed = false;
    console.log('Nothing changed — client is already up to date with the requested modules. Nothing to push.');
  }

  if (committed) {
    console.log(`Committed locally on branch ${branchName} inside ${BUILD_DIR}.`);
    if (confirmPush) {
      console.log('--confirm-push passed — pushing to the client\'s remote now.');
      execSync('git push origin ' + branchName, { cwd: BUILD_DIR, stdio: 'inherit' });
      console.log(`Pushed. Open a Pull Request for branch ${branchName} against the client's default branch and review before merging.`);
    } else {
      console.log('');
      console.log('--confirm-push was NOT passed, so nothing was pushed anywhere.');
      console.log('Review the commit inside ' + BUILD_DIR + ', then push it yourself with:');
      console.log('');
      console.log(`  cd ${BUILD_DIR} && git push origin ${branchName}`);
      console.log('');
      console.log('Then open a Pull Request for review.');
    }
  }
} else {
  execSync('git add .', { cwd: BUILD_DIR, stdio: 'inherit' });
  try {
    execSync(`git commit -m "chore: initial platform delivery (modules: ${effectiveModules.join(', ')})"`, {
      cwd: BUILD_DIR,
      stdio: 'inherit',
    });
    console.log('Committed the fresh delivery locally inside ' + BUILD_DIR + '.');
  } catch {
    console.log('Nothing to commit — .client-build is empty.');
  }
  console.log('This is a fresh delivery: it has no remote configured yet, so there is nothing --confirm-push could push.');
  console.log('Add the new client repository as a remote and push it yourself, e.g.:');
  console.log('');
  console.log(`  cd ${BUILD_DIR} && git remote add origin <client-repo-url> && git push -u origin HEAD`);
}

console.log('');
console.log('Code successfully extracted to ' + BUILD_DIR + '!');

#!/usr/bin/env node
/**
 * Enforces the two rules that make this codebase extensible.
 *
 * DEPTH — a feature module may not reach into another feature module's
 * internals. Allowed from inside apps/api/src/modules/<name>/:
 *   - anything under its own folder
 *   - anything under src/core/          (the shared platform)
 *   - packages (@newax/shared, node_modules)
 *   - another module's public surface:  ../<other>/<other>.module  |  .service
 *
 * Forbidden: ../<other>/dto/…, ../<other>/internal/…, deep files. Reaching for
 * one is the signal that an extension point or a domain event is missing.
 *
 * DIRECTION — a module's pack decides who it may depend on, per
 * apps/api/src/modules/module-packs.ts:
 *   - a `core` module may never import a pack module. Core is what every shop
 *     runs; if it knows about stitching, a grocery deployment is broken.
 *   - a pack module may never import another pack's module. Packs are siblings.
 *   - anything may import core.
 *   - a module absent from MODULE_PACKS fails, because "would a grocery shop
 *     need this?" is not a question a new module gets to skip.
 *
 * Cross-pack work goes through domain events (House Rule 3), one direction:
 * packs subscribe to core.
 *
 * INDEPENDENCE — every module is independent of every other module, full
 * stop, not just across packs. DEPTH and DIRECTION above still name the two
 * ways an import can go wrong; this rule closes the gap they leave open:
 * neither one restricts a public-surface import between two modules of the
 * SAME pack (two core modules, or two modules of one sector pack), so
 * before this rule any core module could freely import any other core
 * module's .module/.service. A module reaching for another module directly
 * is exactly the coupling this whole system exists to prevent — it means a
 * deployment cannot drop, replace, or ship that module on its own anymore.
 *
 * KNOWN_MODULE_COUPLINGS is the one exception, and it stays tiny on
 * purpose: a write that must commit in the SAME database transaction as
 * the write that caused it (an order's payment record, an order's stock
 * deduction, an order's tax line, a purchase order's stock receipt).
 * Decoupling those through an event or an extension point would trade a
 * correctness guarantee for architectural purity — an eventually-consistent
 * stock deduction can race a concurrent sale the same way the bug B6
 * (17-inventory-locations.md) was built to eliminate. Everything else goes
 * through a domain event or an extension point
 * (apps/api/src/core/extension-points/) instead of a direct import — see
 * StockIntakeRegistry for the shape that decoupling takes.
 *
 * Run by `pnpm lint` at the repo root and by CI. An ESLint plugin could do
 * this, but a short script has no version to keep in step with the linter.
 *
 * See docs/implementation/MULTI-SECTOR.md.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const MODULES_ROOT = resolve('apps/api/src/modules');
const PACKS_FILE = resolve('apps/api/src/modules/module-packs.ts');
const PRISMA_SCHEMA_ROOT = resolve('apps/api/prisma/schema');
const IMPORT_PATTERN = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;

/**
 * .prisma files that are not a feature module's schema, but foundational —
 * `core.prisma` holds User/Address/etc, `schema.prisma` is the
 * generator/datasource block. Both are core by convention rather than by
 * matching a MODULE_PACKS entry, since neither is a module.
 */
const CORE_SCHEMA_FILES = new Set(['core', 'schema']);

/** A module's public surface: its NestJS module and its top-level services. */
const PUBLIC_SUFFIXES = ['.module', '.service'];

const CORE_PACK = 'core';

/**
 * TypeScript-import direction violations that already existed when the rule
 * was first enforced.
 *
 * This is a BURN-DOWN LIST, not a configuration knob. Each entry is a place the
 * platform is not yet as portable as it claims, and every one has to be paid off
 * before a second sector can ship.
 *
 * Adding an entry needs a reason in the pull request that a reviewer accepts.
 * "The check was in my way" is not one.
 *
 * An entry that no longer fires is reported as stale and fails the build, so the
 * list can only ever shrink.
 *
 * Empty today: cart.service.ts no longer imports MeasurementsService (the
 * `cart -> measurements` violation this list used to carry is fixed on the
 * TypeScript side). See KNOWN_SCHEMA_VIOLATIONS below — the same underlying
 * "cart bakes in apparel concepts" problem is still live at the Prisma-schema
 * level, just for a different pack (stitching, not measurements).
 */
const KNOWN_VIOLATIONS = new Set([]);

/**
 * The .prisma-level equivalent of KNOWN_VIOLATIONS, keyed the same way
 * checkPrismaBoundaries() reports them: "pack:model.field -> targetPack".
 * Same burn-down discipline: shrink-only, a stale entry fails the build.
 *
 *   core:CartItemStitchingOption.option -> apparel
 *     cart.prisma's CartItemStitchingOption has a real Prisma relation to
 *     StitchingOption (apparel), and cart.service.ts:601-605 reads
 *     item.stitchingOptions[].option directly in PRICE computation — this is
 *     the same "cart bakes in apparel concepts" debt as the (now-fixed)
 *     cart -> measurements TypeScript violation, just for stitching style
 *     options instead of measurements, and money-critical rather than
 *     display-only. Converting `option` to a bare `optionId` scalar (the
 *     pattern used for StitchingJob.orderItemId / StitchingOrder.contactId)
 *     is not enough on its own here — cart's pricing code needs the option's
 *     priceDelta, so the fix is the same extension point the
 *     cart -> measurements entry already called for: an opaque per-line
 *     configuration cart snapshots at add-to-cart time, validated and priced
 *     by the pack that owns the product kind, so cart never resolves a
 *     StitchingOption itself. Do this together with cart -> measurements —
 *     they are one work order, not two.
 */
const KNOWN_SCHEMA_VIOLATIONS = new Set(['core:CartItemStitchingOption.option -> apparel']);

/**
 * The four approved exceptions to INDEPENDENCE, above. Each is a write that
 * must commit in the same database transaction as the write that caused it
 * — see orders.module.ts and purchasing.service.ts for the transactional
 * reasoning at each call site. This is NOT a burn-down list the way
 * KNOWN_VIOLATIONS and KNOWN_SCHEMA_VIOLATIONS are: these four are meant to
 * stay direct imports permanently, not to be paid off. It still fails the
 * build on a stale entry, the same as the other two lists, so a removed
 * import doesn't leave a silent gap in what's enforced.
 *
 * Adding a fifth entry needs the same same-transaction justification in the
 * pull request — "the check was in my way" is not one.
 */
const KNOWN_MODULE_COUPLINGS = new Set([
  'orders -> payments',
  'orders -> inventory',
  'orders -> tax',
  'purchasing -> inventory',
  // product-admin.service.ts writes stock inside the same tx as creating or
  // updating a product's variants (create(), syncVariants()) — the
  // CSV-import path (product-import.service.ts) is NOT transactional and
  // goes through StockIntakeRegistry instead, so this entry covers only the
  // transactional call sites.
  'catalog -> inventory',
  // work-orders.service.ts consumes BOM component stock (RELEASED) and
  // credits the produced variant's stock (COMPLETED) inside the same
  // transaction as the WorkOrder's own status change — same reasoning as
  // purchasing -> inventory above.
  'production -> inventory',
  // purchasing.service.ts creates/links a Supplier's backing Party record
  // (parties.prisma) inside the same transaction as the Supplier write, so a
  // Supplier never exists without its Party or vice versa.
  'purchasing -> parties',
]);

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      entries.push(...walk(full));
    } else if (/\.tsx?$/.test(full) && !/\.spec\.tsx?$/.test(full)) {
      entries.push(full);
    }
  }
  return entries;
}

function moduleNames() {
  return readdirSync(MODULES_ROOT).filter((name) =>
    statSync(join(MODULES_ROOT, name)).isDirectory(),
  );
}

/**
 * Reads MODULE_PACKS out of the TypeScript source. This script cannot import a
 * .ts file, and duplicating the map here would let the two drift — which, for a
 * rule nobody notices until a deployment breaks, is worse than parsing.
 *
 * Throws rather than returning empty: a parse failure must stop the build, not
 * silently disable direction checking.
 */
function modulePacks() {
  let source;
  try {
    source = readFileSync(PACKS_FILE, 'utf8');
  } catch {
    throw new Error(
      `Cannot read ${relative(process.cwd(), PACKS_FILE)}.\n` +
        `It is the source of truth for pack membership — see docs/implementation/MULTI-SECTOR.md.`,
    );
  }

  const block = source.match(/export const MODULE_PACKS[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) {
    throw new Error(
      `Could not find the MODULE_PACKS object literal in ${relative(process.cwd(), PACKS_FILE)}.\n` +
        `This checker parses it as source text, so it must stay a plain literal:\n` +
        `  export const MODULE_PACKS: Record<string, PackName> = { name: 'pack', … };`,
    );
  }

  // A key is either a bareword identifier (accounting:) or a quoted string
  // (needed for a hyphenated module name, e.g. 'identity-verification':).
  const packs = {};
  for (const entry of block[1].matchAll(/^\s*(?:(\w+)|'([^']+)')\s*:\s*'([^']+)'/gm)) {
    packs[entry[1] ?? entry[2]] = entry[3];
  }

  if (Object.keys(packs).length === 0) {
    throw new Error(`MODULE_PACKS in ${relative(process.cwd(), PACKS_FILE)} parsed as empty.`);
  }

  return packs;
}

/** Why one module may not depend on another, or null when it may. */
function directionViolation(ownModule, targetModule, packs) {
  const ownPack = packs[ownModule];
  const targetPack = packs[targetModule];

  // Unclassified modules are reported once per module by checkClassification();
  // skip them here so a missing entry does not also produce noise per import.
  if (!ownPack || !targetPack) return null;

  if (targetPack === CORE_PACK) return null;

  if (ownPack === CORE_PACK) {
    return (
      `the core module "${ownModule}" must not depend on the ${targetPack} pack. ` +
      `Core is what every shop runs — a deployment with ${targetPack} switched off would break. ` +
      `Publish a domain event and let ${targetModule} subscribe.`
    );
  }

  if (ownPack !== targetPack) {
    return (
      `the ${ownPack} module "${ownModule}" must not depend on the ${targetPack} pack. ` +
      `Packs are siblings and cannot assume each other is installed. ` +
      `Route it through core, or through a domain event.`
    );
  }

  return null;
}

function checkFile(file, ownModule, modules, packs) {
  const violations = [];
  const source = readFileSync(file, 'utf8');

  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;

    const target = resolve(file, '..', specifier);
    if (!target.startsWith(MODULES_ROOT)) continue;

    const targetModule = relative(MODULES_ROOT, target).split(/[\\/]/)[0];
    if (!targetModule || targetModule === ownModule || !modules.includes(targetModule)) {
      continue;
    }

    const where = { file: relative(process.cwd(), file), specifier, targetModule };

    const isPublicSurface = PUBLIC_SUFFIXES.some((suffix) => specifier.endsWith(suffix));
    if (!isPublicSurface) {
      violations.push({
        ...where,
        kind: 'depth',
        message: `reaching into the ${targetModule} module's internals.`,
      });
    }

    const direction = directionViolation(ownModule, targetModule, packs);
    if (direction) {
      const pair = `${ownModule} -> ${targetModule}`;
      if (KNOWN_VIOLATIONS.has(pair)) {
        seenKnownViolations.add(pair);
      } else {
        violations.push({ ...where, kind: 'direction', message: direction });
      }
    } else if (isPublicSurface) {
      // DIRECTION already forbids core -> pack and pack -> other-pack; this
      // covers what it leaves open — two modules of the SAME pack.
      const pair = `${ownModule} -> ${targetModule}`;
      if (KNOWN_MODULE_COUPLINGS.has(pair)) {
        seenKnownModuleCouplings.add(pair);
      } else {
        violations.push({
          ...where,
          kind: 'coupling',
          message:
            `the "${ownModule}" module must not import "${targetModule}" directly — every module ` +
            `must be independent of every other. Publish a domain event, or add an extension point ` +
            `(see apps/api/src/core/extension-points/, e.g. StockIntakeRegistry). If this write must ` +
            `commit in the same database transaction as the write that caused it, add ` +
            `"${pair}" to KNOWN_MODULE_COUPLINGS with that justification.`,
        });
      }
    }
  }

  return violations;
}

/** Which burn-down entries actually fired this run, so stale ones can be caught. */
const seenKnownViolations = new Set();
const seenKnownSchemaViolations = new Set();
const seenKnownModuleCouplings = new Set();

/**
 * A listed violation that no longer occurs means someone fixed it — the entry
 * has to go, or the list quietly stops meaning anything.
 */
function checkStaleAllowlist() {
  return [...KNOWN_VIOLATIONS]
    .filter((pair) => !seenKnownViolations.has(pair))
    .map((pair) => ({
      kind: 'stale',
      message:
        `"${pair}" is listed in KNOWN_VIOLATIONS but no longer happens. ` +
        `Delete the entry from scripts/check-module-boundaries.mjs — the list must only shrink.`,
    }))
    .concat(
      [...KNOWN_SCHEMA_VIOLATIONS]
        .filter((pair) => !seenKnownSchemaViolations.has(pair))
        .map((pair) => ({
          kind: 'stale',
          message:
            `"${pair}" is listed in KNOWN_SCHEMA_VIOLATIONS but no longer happens. ` +
            `Delete the entry from scripts/check-module-boundaries.mjs — the list must only shrink.`,
        })),
    )
    .concat(
      [...KNOWN_MODULE_COUPLINGS]
        .filter((pair) => !seenKnownModuleCouplings.has(pair))
        .map((pair) => ({
          kind: 'stale',
          message:
            `"${pair}" is listed in KNOWN_MODULE_COUPLINGS but no longer happens. ` +
            `Delete the entry from scripts/check-module-boundaries.mjs — the list must only shrink.`,
        })),
    );
}

/** Every module directory must declare its pack. */
function checkClassification(modules, packs) {
  return modules
    .filter((name) => !packs[name])
    .map((name) => ({
      kind: 'unclassified',
      module: name,
      message:
        `the "${name}" module is not in MODULE_PACKS. ` +
        `Add it to apps/api/src/modules/module-packs.ts as 'core' if every shop needs it ` +
        `— clothing, grocery, pharmacy, electronics alike — or as its sector's pack if not.`,
    }));
}

/**
 * The .prisma equivalent of directionViolation()'s TypeScript check. A
 * relation FIELD (its type is another model, not a scalar) crossing a pack
 * boundary is exactly as much a coupling as a TypeScript import — B7
 * (MULTI-SECTOR.md) was invisible to the import-only checker above because
 * `OrderItem.stitchingJob StitchingJob?` is a schema-only reference: no
 * `.ts` file ever imports anything named StitchingJob. A pack referencing a
 * core model is fine (packs depend on core); a bare scalar column (its type
 * is String/Int/etc, never a model name) is always fine, relation or not —
 * that is the documented way to keep a soft cross-pack reference (see
 * StitchingOrder.contactId, StitchingJob.orderItemId).
 */
function prismaSchemaFiles() {
  let entries;
  try {
    entries = readdirSync(PRISMA_SCHEMA_ROOT);
  } catch {
    return [];
  }
  return entries.filter((name) => name.endsWith('.prisma')).map((name) => join(PRISMA_SCHEMA_ROOT, name));
}

/** Pulls out every `model Name { ... }` block's raw body, by model name. */
function parseModels(source) {
  const models = new Map();
  for (const match of source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    models.set(match[1], match[2]);
  }
  return models;
}

/**
 * One field's declared type, for lines shaped like `name Type`, `name
 * Type?`, `name Type[]`, ignoring block/line comments, `@@`-attribute lines
 * (@@index, @@id, @@unique, @@map — not fields), and blank lines.
 */
function parseField(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) return null;
  const match = trimmed.match(/^(\w+)\s+(\w+)(?:\[\])?\??/);
  return match ? { name: match[1], type: match[2] } : null;
}

function checkPrismaBoundaries(packs) {
  const files = prismaSchemaFiles();
  if (files.length === 0) return [];

  // Pass 1: which pack owns each model, and each file's own pack.
  const modelPack = new Map();
  const fileInfo = [];
  for (const file of files) {
    const base = relative(PRISMA_SCHEMA_ROOT, file).replace(/\.prisma$/, '');
    const pack = CORE_SCHEMA_FILES.has(base) ? CORE_PACK : packs[base];
    const source = readFileSync(file, 'utf8');
    const models = parseModels(source);
    fileInfo.push({ file, base, pack, models });
    if (!pack) continue; // unclassified — checkClassification() already reports the .ts side
    for (const modelName of models.keys()) modelPack.set(modelName, pack);
  }

  // Pass 2: every field in every model, checked against that map.
  const violations = [];
  for (const { file, base, pack, models } of fileInfo) {
    if (!pack) continue;
    for (const [modelName, body] of models) {
      for (const line of body.split('\n')) {
        const field = parseField(line);
        if (!field) continue;
        const targetPack = modelPack.get(field.type);
        if (!targetPack || targetPack === CORE_PACK || targetPack === pack) continue;

        const pair = `${pack}:${modelName}.${field.name} -> ${targetPack}`;
        if (KNOWN_SCHEMA_VIOLATIONS.has(pair)) {
          seenKnownSchemaViolations.add(pair);
          continue;
        }

        const message =
          pack === CORE_PACK
            ? `the core schema file "${base}.prisma" must not type a field as "${field.type}", owned by the ${targetPack} pack. ` +
              `A deployment with ${targetPack} switched off could not even compile its schema. ` +
              `Keep the foreign key as a plain scalar column (no @relation) and join in application code — see StitchingJob.orderItemId for the pattern.`
            : `the ${pack} schema file "${base}.prisma" must not type a field as "${field.type}", owned by the ${targetPack} pack. ` +
              `Packs are siblings and cannot assume each other is installed.`;

        violations.push({
          kind: 'schema-direction',
          file: relative(process.cwd(), file),
          message: `model ${modelName}: ${message}`,
        });
      }
    }
  }
  return violations;
}

function main() {
  let modules;
  try {
    modules = moduleNames();
  } catch {
    console.log('No apps/api/src/modules directory yet — nothing to check.');
    return;
  }

  let packs;
  try {
    packs = modulePacks();
  } catch (error) {
    console.error(`\nModule pack manifest problem:\n\n  ${error.message}\n`);
    process.exit(1);
  }

  const violations = [
    ...checkClassification(modules, packs),
    ...modules.flatMap((name) =>
      walk(join(MODULES_ROOT, name)).flatMap((file) => checkFile(file, name, modules, packs)),
    ),
    ...checkPrismaBoundaries(packs),
    // After the walk, so it knows which entries fired.
    ...checkStaleAllowlist(),
  ];

  if (violations.length === 0) {
    const byPack = {};
    for (const name of modules) (byPack[packs[name]] ??= []).push(name);
    const summary = Object.entries(byPack)
      .map(([pack, names]) => `${pack}: ${names.length}`)
      .join(', ');
    const debtCount = KNOWN_VIOLATIONS.size + KNOWN_SCHEMA_VIOLATIONS.size;
    const debt = debtCount ? `, ${debtCount} known violation(s) still to pay off` : '';
    const couplingCount = KNOWN_MODULE_COUPLINGS.size;
    const coupling = couplingCount
      ? `, ${couplingCount} approved same-transaction coupling(s)`
      : '';
    console.log(`Module boundaries OK (${modules.length} module(s) — ${summary}${debt}${coupling})`);
    return;
  }

  console.error('\nModule boundary violations:\n');
  for (const violation of violations) {
    if (violation.kind === 'unclassified') {
      console.error(`  apps/api/src/modules/${violation.module}/\n    ${violation.message}\n`);
    } else if (violation.kind === 'stale') {
      console.error(`  ${violation.message}\n`);
    } else if (violation.kind === 'schema-direction') {
      console.error(`  ${violation.file}\n    ${violation.message}\n`);
    } else {
      console.error(
        `  ${violation.file}\n    imports "${violation.specifier}" — ${violation.message}\n`,
      );
    }
  }
  console.error(
    `A module may only import another module's <name>.module or a top-level .service,\n` +
      `and only in a direction its pack allows: anything may depend on core, core may\n` +
      `depend on nothing, and packs may not depend on each other.\n` +
      `If you need something else, publish a domain event or add an extension point.\n` +
      `See docs/implementation/MULTI-SECTOR.md and CONTRIBUTING.md.\n`,
  );
  process.exit(1);
}

main();

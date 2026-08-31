#!/usr/bin/env node
/**
 * Enforces the two rules that make this codebase extensible.
 *
 * DEPTH — a feature module may not reach into another feature module's
 * internals. Allowed from inside apps/api/src/modules/<name>/:
 *   - anything under its own folder
 *   - anything under src/core/          (the shared platform)
 *   - packages (@yaseen/shared, node_modules)
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
 * Run by `pnpm lint` at the repo root and by CI. An ESLint plugin could do
 * this, but a short script has no version to keep in step with the linter.
 *
 * See docs/implementation/MULTI-SECTOR.md.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const MODULES_ROOT = resolve('apps/api/src/modules');
const PACKS_FILE = resolve('apps/api/src/modules/module-packs.ts');
const IMPORT_PATTERN = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;

/** A module's public surface: its NestJS module and its top-level services. */
const PUBLIC_SUFFIXES = ['.module', '.service'];

const CORE_PACK = 'core';

/**
 * Direction violations that already existed when the rule was first enforced.
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
 *   cart -> measurements
 *     Cart holds garment measurements directly: CartItem carries
 *     measurementProfileId and measurementValues, and cart.service.ts calls
 *     MeasurementsService.validate() at add-to-cart time. A grocery deployment
 *     with `measurements` switched off would fail to boot.
 *
 *     The fix is an extension point, not a smaller import: a cart line should
 *     carry opaque per-line configuration that the pack owning the product kind
 *     validates through a registered validator, so cart never names a garment
 *     concept. Sizeable, and its own work order.
 */
const KNOWN_VIOLATIONS = new Set([]);

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

  const packs = {};
  for (const entry of block[1].matchAll(/^\s*(\w+)\s*:\s*'([^']+)'/gm)) {
    packs[entry[1]] = entry[2];
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
    }
  }

  return violations;
}

/** Which burn-down entries actually fired this run, so stale ones can be caught. */
const seenKnownViolations = new Set();

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
    }));
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
    // After the walk, so it knows which entries fired.
    ...checkStaleAllowlist(),
  ];

  if (violations.length === 0) {
    const byPack = {};
    for (const name of modules) (byPack[packs[name]] ??= []).push(name);
    const summary = Object.entries(byPack)
      .map(([pack, names]) => `${pack}: ${names.length}`)
      .join(', ');
    const debt = KNOWN_VIOLATIONS.size
      ? `, ${KNOWN_VIOLATIONS.size} known violation(s) still to pay off`
      : '';
    console.log(`Module boundaries OK (${modules.length} module(s) — ${summary}${debt})`);
    return;
  }

  console.error('\nModule boundary violations:\n');
  for (const violation of violations) {
    if (violation.kind === 'unclassified') {
      console.error(`  apps/api/src/modules/${violation.module}/\n    ${violation.message}\n`);
    } else if (violation.kind === 'stale') {
      console.error(`  ${violation.message}\n`);
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

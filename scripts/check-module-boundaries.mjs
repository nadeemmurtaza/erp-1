#!/usr/bin/env node
/**
 * Enforces the rule that makes this codebase extensible: a feature module may
 * not reach into another feature module's internals.
 *
 * Allowed from inside apps/api/src/modules/<name>/:
 *   - anything under its own folder
 *   - anything under src/core/          (the shared platform)
 *   - packages (@yaseen/shared, node_modules)
 *   - another module's public surface:  ../<other>/<other>.module  |  .service
 *
 * Forbidden: ../<other>/dto/…, ../<other>/internal/…, deep files. Reaching for
 * one is the signal that an extension point or a domain event is missing.
 *
 * Run by `pnpm lint` at the repo root and by CI. An ESLint plugin could do this,
 * but a 90-line script has no version to keep in step with the linter.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const MODULES_ROOT = resolve('apps/api/src/modules');
const IMPORT_PATTERN = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;

/** A module's public surface: its NestJS module and its top-level services. */
const PUBLIC_SUFFIXES = ['.module', '.service'];

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

function checkFile(file, ownModule, modules) {
  const violations = [];
  const source = readFileSync(file, 'utf8');

  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;

    const target = resolve(file, '..', specifier);
    if (!target.startsWith(MODULES_ROOT)) continue;

    const targetModule = relative(MODULES_ROOT, target).split('/')[0];
    if (!targetModule || targetModule === ownModule || !modules.includes(targetModule)) {
      continue;
    }

    const isPublicSurface = PUBLIC_SUFFIXES.some((suffix) =>
      specifier.endsWith(suffix),
    );
    if (!isPublicSurface) {
      violations.push({ file: relative(process.cwd(), file), specifier, targetModule });
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

  const violations = [];
  for (const name of modules) {
    for (const file of walk(join(MODULES_ROOT, name))) {
      violations.push(...checkFile(file, name, modules));
    }
  }

  if (violations.length === 0) {
    console.log(
      `Module boundaries OK (${modules.length} module(s): ${modules.join(', ')})`,
    );
    return;
  }

  console.error('\nModule boundary violations:\n');
  for (const violation of violations) {
    console.error(
      `  ${violation.file}\n    imports "${violation.specifier}" — reaching into the ${violation.targetModule} module's internals.`,
    );
  }
  console.error(
    `\nA module may only import another module's <name>.module or a top-level .service.` +
      `\nIf you need something else, publish a domain event or add an extension point instead.` +
      `\nSee CONTRIBUTING.md.\n`,
  );
  process.exit(1);
}

main();

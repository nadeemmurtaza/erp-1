#!/usr/bin/env node
/**
 * Catches exactly the drift that once let .env quietly fall behind
 * modules.registry.ts: a module that exists in code, is enabled in one env
 * template, but silently missing from another. Any deployment that copies
 * the stale template loses that module's entire admin nav section with no
 * error — see docs discussion on P1 launch-audit item #5.
 *
 * Checks every togglable (non-alwaysOn) FEATURE_MODULES entry appears in the
 * MODULES= line of every tracked *.env.example / *.env.production.example
 * template at the repo root. Run by `pnpm lint`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve('.');
const REGISTRY_FILE = resolve('apps/api/src/modules/modules.registry.ts');

function registeredModules() {
  const source = readFileSync(REGISTRY_FILE, 'utf8');
  const block = source.match(/export const FEATURE_MODULES[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!block) {
    throw new Error(`Could not find FEATURE_MODULES in ${REGISTRY_FILE}.`);
  }

  const names = [];
  for (const entry of block[1].matchAll(/\{\s*name:\s*'([^']+)'[^}]*\}/g)) {
    const isAlwaysOn = /alwaysOn:\s*true/.test(entry[0]);
    if (!isAlwaysOn) names.push(entry[1]);
  }
  return names;
}

function envTemplateFiles() {
  return readdirSync(ROOT).filter(
    (name) => /^\.env(\..+)?\.example$/.test(name) || name === '.env.production.example',
  );
}

function modulesInTemplate(file) {
  const source = readFileSync(resolve(ROOT, file), 'utf8');
  const match = source.match(/^MODULES\s*=\s*"([^"]*)"/m);
  if (!match) return null; // template doesn't set MODULES at all — not this check's concern
  return new Set(
    match[1]
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function main() {
  const registered = registeredModules();
  const templates = envTemplateFiles();

  if (templates.length === 0) {
    console.log('No .env.example-style templates found — nothing to check.');
    return;
  }

  const violations = [];
  for (const file of templates) {
    const listed = modulesInTemplate(file);
    if (!listed) continue;

    const missing = registered.filter((name) => !listed.has(name));
    if (missing.length > 0) {
      violations.push({ file, missing });
    }
  }

  if (violations.length === 0) {
    console.log(`Env templates OK (${templates.length} file(s) checked, ${registered.length} togglable module(s))`);
    return;
  }

  console.error('\nEnv template drift:\n');
  for (const { file, missing } of violations) {
    console.error(
      `  ${file}\n    MODULES= is missing: ${missing.join(', ')}\n    (registered in apps/api/src/modules/modules.registry.ts but absent here — a deploy copying this template loses that module's entire admin nav with no error)\n`,
    );
  }
  process.exit(1);
}

main();

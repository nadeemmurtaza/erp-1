#!/usr/bin/env node
/**
 * Catches exactly the drift that once let .env quietly fall behind
 * modules.registry.ts: a module that exists in code, is enabled in one env
 * template, but silently missing from another. Any deployment that copies
 * the stale template loses that module's entire admin nav section with no
 * error — see docs discussion on P1 launch-audit item #5.
 *
 * Two rules, because "listed" and "switched on" are different questions:
 *
 *   DISCOVERABILITY — every togglable module must be visible in every
 *     template, either enabled in MODULES= or named on that template's
 *     `# Available:` line. This is the original guarantee: a deployer copying
 *     a template can always SEE that a module exists, so it can never go
 *     missing without anyone noticing.
 *
 *   REFERENCE COMPLETENESS — every module not marked `offByDefault` in the
 *     registry must actually be ENABLED in .env.example, the canonical
 *     template. This is what catches a newly added module nobody wired up.
 *
 * The `offByDefault` flag is why there are two rules rather than one. Five
 * modules (organization, accounting, identity-verification, pos, transfers)
 * are registered but deliberately off for every deployment today, because
 * RETAIL-ERP.md R14 requires every chain and GL concept to stay invisible in
 * a Solo shop. A single "must appear in MODULES=" rule cannot express that:
 * satisfying it would switch all five on for every new deployment, which is
 * the opposite of what the architecture asks for. Templates are also allowed
 * to trim deliberately — .env.branch.example says so in as many words — and
 * the `# Available:` line is how a trim stays honest.
 *
 * Run by `pnpm lint`.
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
    if (/alwaysOn:\s*true/.test(entry[0])) continue;
    names.push({ name: entry[1], offByDefault: /offByDefault:\s*true/.test(entry[0]) });
  }
  return names;
}

function envTemplateFiles() {
  return readdirSync(ROOT).filter(
    (name) => /^\.env(\..+)?\.example$/.test(name) || name === '.env.production.example',
  );
}

const asSet = (csv) => new Set(csv.split(',').map((e) => e.trim()).filter(Boolean));

function modulesInTemplate(file) {
  const source = readFileSync(resolve(ROOT, file), 'utf8');
  const match = source.match(/^MODULES\s*=\s*"([^"]*)"/m);
  if (!match) return null; // template doesn't set MODULES at all — not this check's concern

  // `# Available: a,b,c` immediately above MODULES= documents what a deployer
  // may switch on. A module named there is discoverable even when this
  // template leaves it off.
  const available = source.match(/^#\s*Available:\s*(.+)$/m);
  return { enabled: asSet(match[1]), available: available ? asSet(available[1]) : new Set() };
}

function main() {
  const registered = registeredModules();
  const templates = envTemplateFiles();

  if (templates.length === 0) {
    console.log('No .env.example-style templates found — nothing to check.');
    return;
  }

  const violations = [];

  // Rule 1: discoverability, in every template.
  for (const file of templates) {
    const listed = modulesInTemplate(file);
    if (!listed) continue;

    const undiscoverable = registered
      .filter((m) => !listed.enabled.has(m.name) && !listed.available.has(m.name))
      .map((m) => m.name);
    if (undiscoverable.length > 0) {
      violations.push({
        file,
        detail:
          `neither enabled in MODULES= nor named on the '# Available:' line: ${undiscoverable.join(', ')}\n` +
          `    (registered in apps/api/src/modules/modules.registry.ts but invisible here — a deploy\n` +
          `     copying this template loses that module's entire admin nav with no error)`,
      });
    }
  }

  // Rule 2: the canonical template actually enables everything that is on by default.
  const reference = '.env.example';
  if (templates.includes(reference)) {
    const listed = modulesInTemplate(reference);
    if (listed) {
      const notEnabled = registered
        .filter((m) => !m.offByDefault && !listed.enabled.has(m.name))
        .map((m) => m.name);
      if (notEnabled.length > 0) {
        violations.push({
          file: reference,
          detail:
            `on by default in the registry but not in MODULES=: ${notEnabled.join(', ')}\n` +
            `    (mark it offByDefault in modules.registry.ts if that is deliberate)`,
        });
      }
    }
  }

  if (violations.length === 0) {
    const off = registered.filter((m) => m.offByDefault).length;
    console.log(
      `Env templates OK (${templates.length} file(s) checked, ${registered.length} togglable module(s), ${off} off by default)`,
    );
    return;
  }

  console.error('\nEnv template drift:\n');
  for (const { file, detail } of violations) {
    console.error(`  ${file}\n    MODULES= ${detail}\n`);
  }
  process.exit(1);
}

main();

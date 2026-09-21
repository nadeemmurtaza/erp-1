#!/usr/bin/env node
/**
 * Points git at the repository's own hooks directory.
 *
 * `.git/hooks/` is not version-controlled, so a hook committed there reaches
 * exactly one person. `core.hooksPath` moves the hooks into the repository,
 * where a clone, a CI runner and a cloud agent session all get the same ones.
 *
 * Run automatically by the root package.json "prepare" script, so `pnpm
 * install` is all anybody has to remember — and, as a second entry point,
 * by `pnpm lint`'s first step, because a sandbox with cached `node_modules`
 * can skip `pnpm install` entirely (and did: the commit that landed with a
 * stale docs/index/ despite this file's existence had never set
 * `core.hooksPath` at all) while `pnpm lint` is the one command every
 * session's own pre-commit ritual already runs. Safe to run repeatedly: it
 * only writes the config when it is not already correct, and it refuses to
 * overwrite a hooksPath somebody deliberately set somewhere else.
 *
 *   node scripts/install-git-hooks.mjs          install
 *   node scripts/install-git-hooks.mjs --check  report, change nothing
 */
import { execFileSync } from 'node:child_process';
import { existsSync, chmodSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const HOOKS_DIR = '.githooks';
const CHECK = process.argv.includes('--check');

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};

// A tarball, a Docker build context or a vendored copy has no .git — that is
// not an error, there is simply nothing to install into.
if (!existsSync(join(ROOT, '.git'))) {
  console.log('install-git-hooks: no .git directory — nothing to do.');
  process.exit(0);
}

if (!existsSync(join(ROOT, HOOKS_DIR))) {
  console.error(`install-git-hooks: ${HOOKS_DIR}/ is missing from the checkout.`);
  process.exit(CHECK ? 1 : 0);
}

const current = git('config', '--local', '--get', 'core.hooksPath');

if (current === HOOKS_DIR) {
  if (!CHECK) {
    // A fresh clone can land without the executable bit on some filesystems.
    for (const name of readdirSync(join(ROOT, HOOKS_DIR))) {
      try { chmodSync(join(ROOT, HOOKS_DIR, name), 0o755); } catch { /* read-only checkout */ }
    }
  }
  console.log(`install-git-hooks: core.hooksPath is already ${HOOKS_DIR}.`);
  process.exit(0);
}

if (CHECK) {
  console.error(
    `install-git-hooks: core.hooksPath is "${current || '(unset)'}", expected "${HOOKS_DIR}".\n` +
    '  docs/index/ will not stay in step with your commits.\n' +
    '  Run: node scripts/install-git-hooks.mjs',
  );
  process.exit(1);
}

if (current && current !== HOOKS_DIR) {
  console.error(
    `install-git-hooks: core.hooksPath is already set to "${current}".\n` +
    `  Leaving it alone — someone chose that deliberately.\n` +
    `  To use this repository's hooks, either point that directory at ${HOOKS_DIR}/,\n` +
    `  or run: git config --local core.hooksPath ${HOOKS_DIR}`,
  );
  process.exit(0);
}

git('config', '--local', 'core.hooksPath', HOOKS_DIR);
for (const name of readdirSync(join(ROOT, HOOKS_DIR))) {
  try { chmodSync(join(ROOT, HOOKS_DIR, name), 0o755); } catch { /* read-only checkout */ }
}

const verify = git('config', '--local', '--get', 'core.hooksPath');
if (verify !== HOOKS_DIR) {
  console.error('install-git-hooks: failed to set core.hooksPath.');
  process.exit(1);
}
console.log(`install-git-hooks: core.hooksPath -> ${HOOKS_DIR} (pre-commit keeps docs/index/ current).`);

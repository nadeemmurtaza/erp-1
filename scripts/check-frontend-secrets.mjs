#!/usr/bin/env node
/**
 * Enforces House Rule 12 — secrets live on the server, never in the client.
 *
 * The browser and the Expo app may only read environment variables already
 * public by definition, and Next.js/Expo both require those to be named as
 * such: `NEXT_PUBLIC_*` in apps/web, `EXPO_PUBLIC_*` in apps/mobile. Anything
 * else read from `process.env` in frontend code either silently resolves to
 * `undefined` in the shipped bundle (confusing) or, worse, is exactly the
 * mistake this check exists to catch: a secret meant for the server ends up
 * bundled into a page every visitor's browser downloads.
 *
 * Also flags a handful of secret-shaped string literals — a hardcoded key
 * slipping in via copy-paste bypasses the env-var check entirely, so this is
 * a second, independent line of defense, not a duplicate of the first.
 *
 * Run by `pnpm lint` at the repo root and by CI, alongside
 * check-module-boundaries.mjs. See docs/implementation/00-HOUSE-RULES.md
 * Rule 12 and docs/security/security-architecture.md.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const TARGETS = [
  { dir: resolve('apps/web/src'), label: 'apps/web', publicPrefix: 'NEXT_PUBLIC_' },
  { dir: resolve('apps/mobile'), label: 'apps/mobile', publicPrefix: 'EXPO_PUBLIC_' },
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.expo',
  'dist',
  'build',
  'generated',
  'coverage',
  '.turbo',
]);

const ENV_PATTERN = /process\.env\.([A-Z_][A-Z0-9_]*)/g;

/** Secret-shaped literals: a hardcoded key bypasses the env-var check entirely. */
const SECRET_LITERAL_PATTERNS = [
  { name: 'Stripe-style secret key', pattern: /\bsk_(live|test)_[A-Za-z0-9]{16,}/ },
  { name: 'AWS access key ID', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'PEM private key block', pattern: /-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----/ },
  { name: 'JWT-looking bearer literal', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
];

function walk(dir) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      files.push(...walk(full));
    } else if (SOURCE_EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
      files.push(full);
    }
  }
  return files;
}

function checkFile(file, publicPrefix) {
  const violations = [];
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    for (const match of line.matchAll(ENV_PATTERN)) {
      const name = match[1];
      if (!name.startsWith(publicPrefix)) {
        violations.push({
          file,
          line: index + 1,
          kind: 'env',
          message: `reads process.env.${name} — not prefixed "${publicPrefix}", so it is either undefined in the shipped bundle or, if it resolves at build time, a secret bundled into client code`,
        });
      }
    }

    for (const { name, pattern } of SECRET_LITERAL_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          file,
          line: index + 1,
          kind: 'literal',
          message: `contains what looks like a ${name} — hardcoded secrets belong in an environment variable read on the server, never in frontend source`,
        });
      }
    }
  });

  return violations;
}

function main() {
  const violations = [];

  for (const { dir, label, publicPrefix } of TARGETS) {
    for (const file of walk(dir)) {
      violations.push(...checkFile(file, publicPrefix).map((v) => ({ ...v, label })));
    }
  }

  if (violations.length === 0) {
    console.log(
      `Frontend secrets check OK (${TARGETS.map((t) => t.label).join(', ')} — no server-only env reads, no hardcoded secret-shaped literals)`,
    );
    return;
  }

  console.error('\nHouse Rule 12 violations — secrets in frontend code:\n');
  for (const violation of violations) {
    const relPath = relative(resolve('.'), violation.file);
    console.error(`  ${relPath}:${violation.line}\n    ${violation.message}\n`);
  }
  console.error(
    `The browser and the Expo app hold zero secrets. Only environment values already\n` +
      `public by definition may be read from frontend code, and only under their\n` +
      `platform's public prefix (NEXT_PUBLIC_* in apps/web, EXPO_PUBLIC_* in\n` +
      `apps/mobile). Move the value to the backend and expose it through an API call\n` +
      `instead. See docs/implementation/00-HOUSE-RULES.md Rule 12.\n`,
  );
  process.exit(1);
}

main();

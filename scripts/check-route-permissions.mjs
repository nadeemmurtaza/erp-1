#!/usr/bin/env node
/**
 * Every route says who may call it.
 *
 * JwtAuthGuard is global, so a route with no decorator is authenticated but
 * otherwise unrestricted: any signed-in user — a tailor, a packer, a customer
 * with an account — can call it. That is almost never what was meant, and it
 * is the quietest mistake in the codebase, because the route works perfectly
 * for the person who wrote it.
 *
 * A route must carry one of:
 *
 *   @RequirePermission('orders.refund')   the capability it needs
 *   @Public()                             deliberately open, no token
 *   @AuthenticatedOnly()                  deliberately any signed-in user
 *
 * The third exists so "any signed-in user" can be *stated* rather than
 * inferred from silence — a reviewer can then tell a decision from an
 * omission, which is the whole point.
 *
 * Decorators are read as a block, not by scanning upward: Nest allows them in
 * any order, and this codebase commonly writes `@Get()` above
 * `@RequirePermission(...)`. A checker that only looked up reported every one
 * of those as unguarded.
 *
 * Usage: node scripts/check-route-permissions.mjs [--json]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchored to this file, not to cwd: `pnpm lint` runs it from apps/api, and
// resolving against cwd looked for apps/api/apps/api/src.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const API_SRC = join(ROOT, 'apps', 'api', 'src');

const HTTP_METHOD = /^\s*@(Get|Post|Put|Patch|Delete|Head|Options|All)\s*\(/;
const GUARDED = /^\s*@(RequirePermission|Public|AuthenticatedOnly)\s*\(/;
const DECORATOR = /^\s*@\w+/;
const SKIP = /\.spec\.ts$|\.dto\.ts$|[\\/]dto[\\/]/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'generated') continue;
      out.push(...walk(full));
    } else if (full.endsWith('.ts') && !SKIP.test(full)) {
      out.push(full);
    }
  }
  return out;
}

const findings = [];

for (const file of walk(API_SRC)) {
  const source = readFileSync(file, 'utf8');
  if (!source.includes('@Controller')) continue;

  const lines = source.split('\n');

  /*
   * Guards are resolved per class, not per file. A file can hold several
   * controllers — `crm.controller.ts` has a public one and an admin one — and
   * the admin class carries its permission at class level. Checking only the
   * decorators above the *first* class reported every route in the second
   * class as unguarded.
   */
  const classes = [];
  lines.forEach((line, i) => {
    if (!/^export class /.test(line)) return;
    let guarded = false;
    for (let j = i - 1; j >= 0; j -= 1) {
      const above = lines[j];
      if (GUARDED.test(above)) { guarded = true; break; }
      if (!DECORATOR.test(above) && above.trim() !== '' && !/^\s+\S/.test(above)) break;
    }
    classes.push({ start: i, guarded });
  });

  const guardedAt = (index) => {
    let current = null;
    for (const klass of classes) if (klass.start < index) current = klass;
    return current ? current.guarded : false;
  };

  let block = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (DECORATOR.test(line)) {
      block.push({ line, index: i });
      continue;
    }

    // A blank line or a continuation keeps the block open; anything else ends
    // it, and the block is judged at that point.
    if (line.trim() === '' || /^\s*[)\]}]/.test(line) || /^\s+\S/.test(line)) {
      if (block.length && !/^\s*(async\s+)?\w+\s*\(/.test(line)) continue;
    }

    if (block.length) {
      const route = block.find((entry) => HTTP_METHOD.test(entry.line));
      if (
        route &&
        !guardedAt(route.index) &&
        !block.some((entry) => GUARDED.test(entry.line))
      ) {
        findings.push({
          file: relative(ROOT, file).replace(/\\/g, '/'),
          line: route.index + 1,
          route: route.line.trim(),
        });
      }
      block = [];
    }
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(findings, null, 2));
} else if (findings.length) {
  console.error(
    `\n${findings.length} route(s) do not say who may call them.\n` +
      'Add @RequirePermission(...), @Public(), or @AuthenticatedOnly().\n',
  );
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.route}`);
  console.error('');
} else {
  console.log('Route permissions: every route states its access.');
}

process.exit(findings.length ? 1 : 0);

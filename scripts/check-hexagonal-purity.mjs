#!/usr/bin/env node
/**
 * Enforces "the core doesn't know its caller" — architecture-patterns/
 * 134-hexagonal-purity-ci-check.md (WO-134.1/134.2).
 *
 * Doc 115 found this repository already practices hexagonal architecture:
 * every service method is trigger-agnostic, called identically whether the
 * caller is an HTTP controller, a domain-event subscriber, or a future MCP
 * tool adapter — but only as an *observed* pattern, checked by review, not
 * by a machine. This is the same treatment check-module-boundaries.mjs
 * already gives module independence, applied here to hexagonal purity: a
 * service file that imports a transport-layer type (Express's Request/
 * Response) or a frontend-framework import (React/Next.js) is evidence the
 * "core" has started assuming a specific caller.
 *
 * A controller importing Request/Response from 'express' is correct and
 * expected — the controller IS the transport-layer adapter; this check
 * only scans *.service.ts files, never *.controller.ts.
 *
 * Run by `pnpm lint` at the repo root and by CI, alongside
 * check-module-boundaries.mjs. `node scripts/check-hexagonal-purity.mjs
 * --self-test` proves the matcher catches a violation and ignores a
 * legitimate service import, per this repository's own convention for
 * every check in the `pnpm lint` chain (see check-rebrand.mjs).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const API_SRC = resolve('apps/api/src');
const IMPORT_PATTERN = /import\s+(?:type\s+)?(?:\{[^}]*\}|[\w*\s,]+)\s+from\s+['"]([^'"]+)['"]/g;

/** A specifier that names a transport-layer or frontend-framework dependency. */
function violatingSpecifier(specifier) {
  if (specifier === 'express') return 'the transport layer (Express)';
  if (specifier === 'react' || specifier.startsWith('react/')) return 'a frontend framework (React)';
  if (specifier === 'next' || specifier.startsWith('next/')) return 'a frontend framework (Next.js)';
  return null;
}

/** Every violation in one service file's own source text — pure, so --self-test can drive it. */
function scan(source) {
  const violations = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const reason = violatingSpecifier(match[1]);
    if (!reason) continue;
    const line = source.slice(0, match.index).split('\n').length;
    violations.push({ line, specifier: match[1], reason });
  }
  // @Req()/@Res() only mean anything on a controller method signature; a
  // service importing either decorator is evidence of the same coupling
  // even without importing 'express' directly (e.g. typed inline as `any`).
  for (const match of source.matchAll(/@(Req|Res)\(\)/g)) {
    const line = source.slice(0, match.index).split('\n').length;
    violations.push({
      line,
      specifier: `@${match[1]}()`,
      reason: 'the transport layer (an HTTP request/response decorator)',
    });
  }
  return violations;
}

function walkServiceFiles(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      entries.push(...walkServiceFiles(full));
    } else if (/\.service\.ts$/.test(full) && !/\.spec\.ts$/.test(full)) {
      entries.push(full);
    }
  }
  return entries;
}

/* ── self-test ─────────────────────────────────────────────────────────── */

function selfTest() {
  const cases = [
    [`import { Request } from 'express';\nexport class X {}`, true, 'an Express Request import'],
    [`import type { Response } from 'express';\nexport class X {}`, true, 'a type-only Express import'],
    [`import { useState } from 'react';\nexport class X {}`, true, 'a React import'],
    [`import { redirect } from 'next/navigation';\nexport class X {}`, true, 'a Next.js subpath import'],
    [`async f(@Req() req) {}`, true, 'an @Req() decorator with no import'],
    [`import { Injectable } from '@nestjs/common';\nexport class X {}`, false, 'an ordinary NestJS import'],
    [`import { PrismaService } from '../../core/prisma/prisma.service';\nexport class X {}`, false, 'a same-repo service import'],
    [`// this service never sees a Request from 'express'\nexport class X {}`, false, 'a comment mentioning the word'],
  ];

  let failed = 0;
  for (const [source, shouldFail, what] of cases) {
    const hit = scan(source).length > 0;
    const ok = hit === shouldFail;
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${shouldFail ? 'catches' : 'ignores'} ${what}`);
  }
  if (failed) {
    console.error(`\n${failed} self-test case(s) failed — the matcher does not do what this file says it does.\n`);
    process.exit(1);
  }
  console.log(`\nSelf-test OK (${cases.length} cases) — the matcher catches a transport/frontend import and ignores an ordinary service import.`);
}

/* ── main ──────────────────────────────────────────────────────────────── */

function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  let files;
  try {
    files = walkServiceFiles(API_SRC);
  } catch {
    console.log('No apps/api/src directory yet — nothing to check.');
    return;
  }

  const violations = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const violation of scan(source)) {
      violations.push({ file: relative(process.cwd(), file), ...violation });
    }
  }

  if (violations.length === 0) {
    console.log(`Hexagonal purity OK (${files.length} service file(s) — no transport-layer or frontend-framework import)`);
    return;
  }

  console.error('\nHexagonal purity violations:\n');
  for (const violation of violations) {
    console.error(
      `  ${violation.file}:${violation.line}\n` +
        `    "${violation.specifier}" reaches into ${violation.reason} — a service must stay callable\n` +
        `    identically from HTTP, a domain-event subscriber, or a future adapter. Extract what the\n` +
        `    caller needs into a plain, typed argument in the controller instead.\n`,
    );
  }
  console.error(
    `A *.service.ts file may not import Express, React or Next.js, or use an @Req()/@Res()\n` +
      `decorator — those belong to the controller, which is the transport-layer adapter.\n` +
      `See docs/implementation/architecture-patterns/134-hexagonal-purity-ci-check.md\n` +
      `and architecture-patterns/115-hexagonal-architecture-ports-adapters.md.\n`,
  );
  process.exit(1);
}

main();

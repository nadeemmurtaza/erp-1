#!/usr/bin/env node
/**
 * Enforces architecture-patterns/141-general-metadata-driven-ui-engine.md
 * §2's own mandatory guardrail against `MetadataDrivenForm`
 * (apps/web/src/components/admin/metadata-driven-form.tsx), the one file
 * this repository's metadata-driven UI engine renders through.
 *
 * Doc 141's own real risk was never "metadata-driven rendering is
 * impossible to do safely" — it was "a generic renderer easily becomes a
 * second, uninspected component library." Checked against this codebase's
 * own actual idiom (`custom-field-form-section.tsx`, already shipped and
 * already swept by `pnpm check:overflow`/`check:contrast`): the real
 * primitive set is plain semantic HTML elements styled through
 * `.field-label`/`.field-input`/`.field-check`, never a dedicated
 * component library — `@newax/shared` itself has no React components at
 * all (DECISIONS.md ADR-049 corrects the document's own literal premise
 * that it does). So the mechanically-checkable version of the guardrail
 * is: this one file may import nothing beyond its own local helpers and
 * `@/types/api`'s types, and may never use an inline `style` prop — the
 * two ways a "second component library" or a design-law bypass would
 * actually enter this file. Introducing a *new* UI dependency here (a
 * component kit, a CSS-in-JS library) is exactly the drift this check
 * exists to catch at the one file where it would start.
 *
 * Run by `pnpm lint`. `--self-test` proves the matcher against known-good
 * and known-bad fixtures, none of which touch the real file on disk.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const TARGET_FILE = 'apps/web/src/components/admin/metadata-driven-form.tsx';

/** Only these import specifiers may appear in the target file. */
const ALLOWED_IMPORTS = new Set(['react', '@/types/api']);
const IMPORT_PATTERN = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
const INLINE_STYLE_PATTERN = /\bstyle\s*=\s*\{/;

export function findViolations(source) {
  const violations = [];

  if (INLINE_STYLE_PATTERN.test(source)) {
    violations.push('uses an inline `style` prop — every visual property must come from an existing class, never inline.');
  }

  let match;
  IMPORT_PATTERN.lastIndex = 0;
  while ((match = IMPORT_PATTERN.exec(source))) {
    const specifier = match[1];
    if (specifier.startsWith('.')) continue; // a relative import within this same renderer is fine
    if (!ALLOWED_IMPORTS.has(specifier)) {
      violations.push(`imports "${specifier}" — only ${[...ALLOWED_IMPORTS].map((s) => `"${s}"`).join(', ')} (plus a relative import) are approved.`);
    }
  }

  return violations;
}

/* ── self-test ─────────────────────────────────────────────────────────── */

const GOOD_FIXTURE = `
'use client';
import type { FieldMetadata } from '@/types/api';
export function MetadataDrivenForm({ fields }: { fields: FieldMetadata[] }) {
  return <input className="field-input" type="text" />;
}
`;

const BAD_FIXTURE_IMPORT = `
'use client';
import { Button } from '@/components/ui';
export function MetadataDrivenForm() {
  return <Button>Save</Button>;
}
`;

const BAD_FIXTURE_STYLE = `
'use client';
export function MetadataDrivenForm() {
  return <input style={{ color: 'red' }} />;
}
`;

function selfTest() {
  const cases = [
    { name: 'the real idiom (plain element + .field-input) passes clean', source: GOOD_FIXTURE, expectViolations: false },
    { name: 'importing a component library outside the approved set is caught', source: BAD_FIXTURE_IMPORT, expectViolations: true },
    { name: 'an inline style prop is caught', source: BAD_FIXTURE_STYLE, expectViolations: true },
  ];

  let failed = 0;
  for (const testCase of cases) {
    const violations = findViolations(testCase.source);
    const got = violations.length > 0;
    const ok = got === testCase.expectViolations;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${testCase.name}`);
    if (!ok) failed++;
  }

  if (failed > 0) {
    console.error(`\n${failed} self-test case(s) failed — the matcher does not do what this file says it does.\n`);
    process.exit(1);
  }
  console.log(`\nSelf-test OK (${cases.length} cases).`);
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  const path = resolve(TARGET_FILE);
  let source;
  try {
    source = readFileSync(path, 'utf8');
  } catch {
    console.log(`${TARGET_FILE} does not exist yet — nothing to check.`);
    return;
  }

  const violations = findViolations(source);
  if (violations.length === 0) {
    console.log(`Metadata renderer OK (${TARGET_FILE} stays inside its approved primitive set).`);
    return;
  }

  console.error(`\n${TARGET_FILE} violates its own guardrail:\n`);
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error(
    '\nSee architecture-patterns/141-general-metadata-driven-ui-engine.md §2: ' +
      'this file may compose only plain elements + the .field-* classes, never a second component library.\n',
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

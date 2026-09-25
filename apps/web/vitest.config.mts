import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Pure-logic unit tests only (WO-A.5's own `resolve-path.spec.ts`
 * acceptance criterion) — end-to-end and rendered-page coverage stays with
 * Playwright, per this app's `test` script before this file existed. No
 * React plugin: nothing here renders a component, only functions that take
 * data and return data.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // Jest-compatible globals (describe/it/expect with no import) — the
    // same style every apps/api spec already uses, so a spec reads the
    // same whichever app it lives in.
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
});

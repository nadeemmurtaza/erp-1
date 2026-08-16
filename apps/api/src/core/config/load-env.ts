import { config } from 'dotenv';

/**
 * Loads .env into process.env as a side effect of being imported.
 *
 * This must run BEFORE AppModule is imported: the module registry reads the
 * MODULES allowlist while composing the module graph, which happens when the
 * AppModule class decorator is evaluated — long before Nest's ConfigModule gets
 * a chance to load anything. Import this first in main.ts and in test setup.
 *
 * The repo-root .env is the shared one; apps/api/.env overrides it locally.
 */
config({ path: ['.env', '../../.env'], quiet: true });

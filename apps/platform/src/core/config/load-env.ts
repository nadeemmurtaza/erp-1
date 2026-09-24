import { config } from 'dotenv';

/**
 * Loads .env into process.env as a side effect of being imported. Import
 * this first in main.ts and in test setup, before AppModule.
 *
 * apps/platform/.env overrides the repo-root .env, which is shared by every
 * app in the monorepo — but every var this app actually reads is
 * PLATFORM_-prefixed, so nothing here can collide with a tenant app's own
 * DATABASE_URL/APP_ENCRYPTION_KEY even when both files are present.
 */
config({ path: ['.env', '../../.env'], quiet: true });

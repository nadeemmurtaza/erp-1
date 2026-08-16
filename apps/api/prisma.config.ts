// A Prisma config file switches OFF Prisma's automatic .env loading, so we do
// it ourselves — the CLI still needs DATABASE_URL for migrate/studio/seed.
// The repo-root .env is the shared one; an apps/api/.env overrides it locally.
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: ['.env', '../../.env'], quiet: true });

/**
 * Prisma reads its configuration from here rather than from package.json,
 * which is deprecated. `schema` points at a FOLDER: every module owns its own
 * .prisma file in prisma/schema/, so adding a module never touches a shared
 * schema file.
 */
export default defineConfig({
  earlyAccess: true,
  schema: 'prisma/schema',
});

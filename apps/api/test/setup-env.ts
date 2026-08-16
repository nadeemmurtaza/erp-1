import { config } from 'dotenv';

// Same ordering rule as src/core/config/load-env.ts: the environment must be
// populated before any module graph is composed.
config({ path: ['.env.test', '.env', '../../.env'], quiet: true });

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-at-least-32-characters-long';
process.env.MODULES ??= 'catalog,measurements';

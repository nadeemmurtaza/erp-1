import { config } from 'dotenv';

config({ path: ['.env.test', '.env', '../../.env'], quiet: true });

process.env.NODE_ENV = 'test';
process.env.PLATFORM_ENCRYPTION_KEY ??= 'test-platform-encryption-key-32b';
process.env.PLATFORM_OPS_KEY_PEPPER ??= 'test-ops-key-pepper-at-least-32-chars-long';

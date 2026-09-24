import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: ['.env', '../../.env'], quiet: true });

export default defineConfig({
  earlyAccess: true,
  schema: 'prisma/schema',
});

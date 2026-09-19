import { fileURLToPath } from 'url';
import path from 'path';

const workspaceRoot = path.join(fileURLToPath(new URL('.', import.meta.url)), '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Trace file dependencies from the pnpm workspace root — @newax/shared and
  // @newax/pos-core are workspace TypeScript packages, not prebuilt, same
  // reasoning as apps/web's own next.config.
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: ['@newax/shared', '@newax/pos-core'],
};

export default nextConfig;

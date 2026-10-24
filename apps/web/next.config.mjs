import createNextIntlPlugin from 'next-intl/plugin';
import { fileURLToPath } from 'url';
import path from 'path';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const workspaceRoot = path.join(fileURLToPath(new URL('.', import.meta.url)), '../..');

/**
 * The 8 hand-built insight/analytics pages 10-admin-dashboard.md WO-E.2
 * retires, each replaced by a report-registry entry under `/admin/analytics/*`
 * (`report-registry.ts`). A permanent redirect, not a deleted route, so a
 * bookmark or a link shared before this rebuild still lands somewhere real.
 */
const RETIRED_INSIGHT_PAGES = [
  { source: '/admin/insights', destination: '/admin/analytics' },
  { source: '/admin/orders/insights', destination: '/admin/analytics/orders/overview' },
  { source: '/admin/customers/insights', destination: '/admin/analytics/customers/overview' },
  { source: '/admin/workshop/insights', destination: '/admin/analytics/workshop/output' },
  { source: '/admin/inventory/insights', destination: '/admin/analytics/inventory/valuation' },
  { source: '/admin/products/insights', destination: '/admin/analytics/products/top-sellers' },
  { source: '/admin/finance/expenses/analytics', destination: '/admin/analytics/expenses/by-category' },
  { source: '/admin/purchase-orders/spend', destination: '/admin/analytics/purchasing/spend' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return RETIRED_INSIGHT_PAGES.map((route) => ({ ...route, permanent: true }));
  },
  // Self-contained server bundle (server.js + only the node_modules it
  // actually needs) — what the production Docker image copies, instead of
  // the full workspace node_modules.
  output: 'standalone',
  // Trace file dependencies from the pnpm workspace root, not just this app —
  // without this, standalone output can miss @newax/shared's real files in
  // a monorepo and misdetect the root, which prints a build warning and can
  // leave the trace incomplete.
  outputFileTracingRoot: workspaceRoot,
  // The shared package is TypeScript source in the workspace, not prebuilt.
  transpilePackages: ['@newax/shared'],
  images: {
    // Placeholder swatches are SVGs we generate ourselves; the CSP below keeps
    // them inert even so.
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      // Local uploads served by the API's files controller.
      { protocol: 'http', hostname: 'localhost', port: '3001' },
      { protocol: 'http', hostname: '127.0.0.1', port: '3001' },
      // Production API, when STORAGE_DRIVER=local (uploads served from the API itself).
      { protocol: 'https', hostname: 'api.yaseen.pk' },
      // Production object storage. Set S3_PUBLIC_URL's host here when deploying.
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
    ],
  },
};

export default withNextIntl(nextConfig);

import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared package is TypeScript source in the workspace, not prebuilt.
  transpilePackages: ['@yaseen/shared'],
  images: {
    // Placeholder swatches are SVGs we generate ourselves; the CSP below keeps
    // them inert even so.
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      // Local uploads served by the API's files controller.
      { protocol: 'http', hostname: 'localhost', port: '3001' },
      { protocol: 'http', hostname: '127.0.0.1', port: '3001' },
      // Production object storage. Set S3_PUBLIC_URL's host here when deploying.
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
    ],
  },
};

export default withNextIntl(nextConfig);

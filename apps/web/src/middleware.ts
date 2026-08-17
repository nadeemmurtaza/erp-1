import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  /**
   * Storefront paths only. The matcher deliberately excludes:
   *   admin  — the back office is English and must not be locale-prefixed
   *   api    — Next route handlers
   *   _next, _vercel, files with an extension — static assets
   */
  matcher: ['/', '/((?!admin|api|_next|_vercel|.*\\..*).*)'],
};

import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  /**
   * Storefront paths only. The matcher deliberately excludes:
   *   admin            — the back office is English and must not be locale-prefixed
   *   api              — Next route handlers
   *   checkout/callback — the payment gateway return URL (EASYPAISA_RETURN_URL /
   *                       JAZZCASH_RETURN_URL) is a fixed, non-locale-prefixed
   *                       value; a locale-redirect here could turn the
   *                       gateway's POST-back into a GET and lose the result
   *   _next, _vercel, files with an extension — static assets
   */
  matcher: ['/', '/((?!admin|api|checkout/callback|_next|_vercel|.*\\..*).*)'],
};

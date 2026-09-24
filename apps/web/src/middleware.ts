import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { LOCALES } from '@newax/shared';
import { API_URL } from '@/lib/api-client';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

interface CachedLookup {
  result: { toPath: string; statusCode: number } | null;
  expiresAt: number;
}

// Best-effort, in-memory, per-isolate cache — same idiom as the API's own
// SettingsService. A cold isolate or an expired entry just means one extra
// lookup; it never blocks or breaks navigation if the API is unreachable.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CachedLookup>();

/** Strips a locale prefix, if the path has one, leaving the bare path Redirect.fromPath stores. */
function stripLocale(pathname: string): { locale: string | null; path: string } {
  for (const locale of LOCALES) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return { locale, path: pathname.slice(locale.length + 1) || '/' };
    }
  }
  return { locale: null, path: pathname };
}

async function lookupRedirect(path: string): Promise<CachedLookup['result']> {
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  let result: CachedLookup['result'] = null;
  try {
    const response = await fetch(`${API_URL}/catalog/redirects/lookup?path=${encodeURIComponent(path)}`);
    if (response.ok) {
      const body = await response.json();
      result = body ? { toPath: body.toPath, statusCode: body.statusCode } : null;
    }
  } catch {
    // Unreachable API — fall through to ordinary routing rather than 500ing every request.
  }

  cache.set(path, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/** WO-3.9 (03-variants-sku-seo.md) — a 301/302 for a slug that has since changed, served before the locale matcher runs. */
export default async function middleware(request: NextRequest) {
  const { locale, path } = stripLocale(request.nextUrl.pathname);
  const redirect = await lookupRedirect(path);

  if (redirect) {
    const target = request.nextUrl.clone();
    target.pathname = locale ? `/${locale}${redirect.toPath}` : redirect.toPath;
    return NextResponse.redirect(target, redirect.statusCode);
  }

  return intlMiddleware(request);
}

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

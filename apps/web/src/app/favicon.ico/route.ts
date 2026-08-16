import { redirect } from 'next/navigation';

/**
 * Browsers request /favicon.ico whether or not the page asks them to.
 *
 * Without this route that path falls through to the storefront's [locale]
 * segment, which renders the home page with locale="favicon.ico" and fires a
 * catalogue request the API rightly rejects — noise in the logs on every single
 * page view. Redirecting to the real icon answers the browser and keeps the
 * locale routes clean.
 */
export const dynamic = 'force-static';

export function GET(): never {
  redirect('/icon.svg');
}

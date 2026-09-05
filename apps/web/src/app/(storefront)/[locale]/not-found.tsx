import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';

/**
 * Storefront 404.
 *
 * Reached by a mistyped URL and, deliberately, by `notFound()` in the product
 * and category pages — a discontinued product should land a customer here
 * rather than on a crash. Offers the shop rather than only "go home", since
 * someone who followed a dead product link is still shopping.
 */
export default function StorefrontNotFound() {
  return (
    <main className="container-page flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="font-display text-sm font-semibold uppercase tracking-wide text-neutral-500">
        404
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold text-neutral-900 sm:text-4xl">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-3 max-w-md text-sm text-neutral-500">
        It may have been moved, or the piece may no longer be in stock. The rest
        of the collection is still here.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href={ROUTES.storefront.shop} className="sf-btn-primary">
          Browse the shop
        </Link>
        <Link href="/" className="sf-btn-secondary">
          Go home
        </Link>
      </div>
    </main>
  );
}

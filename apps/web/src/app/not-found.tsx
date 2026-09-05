import Link from 'next/link';

/**
 * Root 404, for a URL that matches no route at all (`/en/nonsense`, `/xyz`).
 *
 * Distinct from `(storefront)/[locale]/not-found.tsx`, which handles a
 * `notFound()` thrown *inside* a matched storefront route — a discontinued
 * product, say — and renders inside the shop's header and footer. Nothing
 * matched here, so no layout applies and this file supplies its own
 * `<html>`/`<body>`: this app has no `app/layout.tsx`, each route group owns
 * its own root layout, and an unmatched URL belongs to none of them.
 */
export default function RootNotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F2F2F2',
          color: '#121111',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          padding: '1.5rem',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <p
            style={{
              margin: 0,
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#787676',
            }}
          >
            404
          </p>
          <h1 style={{ marginTop: '0.75rem', fontSize: '1.5rem', fontWeight: 600 }}>
            We couldn&apos;t find that page
          </h1>
          <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#514E4E' }}>
            The address may be mistyped, or the page may have moved.
          </p>
          <Link
            href="/en/shop"
            style={{
              display: 'inline-block',
              marginTop: '1.5rem',
              borderRadius: '9999px',
              backgroundColor: '#292526',
              color: '#ffffff',
              padding: '0.75rem 1.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Browse the shop
          </Link>
        </div>
      </body>
    </html>
  );
}

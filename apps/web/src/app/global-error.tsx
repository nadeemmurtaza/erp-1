'use client';

/**
 * Last-resort boundary, for a crash in a root layout itself.
 *
 * The per-section `error.tsx` files render *inside* their layout, so they
 * cannot catch a failure in that layout — if the storefront or admin layout
 * throws, only this file is left. That is also why it renders its own
 * `<html>`/`<body>`: at this point React has discarded the tree that normally
 * provides them, so nothing else will.
 *
 * Styles are inline for the same reason. If the failure was in the layout
 * that imports `globals.css`, no stylesheet is guaranteed to be present, and
 * a Tailwind class here would render as unstyled text.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
            Something went badly wrong
          </h1>
          <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#514E4E' }}>
            The site failed to start rendering. Reloading usually clears it.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              borderRadius: '9999px',
              border: 'none',
              backgroundColor: '#292526',
              color: '#ffffff',
              padding: '0.75rem 1.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {error.digest ? (
            <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#8E8C8C' }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}

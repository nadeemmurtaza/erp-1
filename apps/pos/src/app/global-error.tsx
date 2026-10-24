'use client';

/**
 * Last-resort boundary, for a crash in the root layout itself (CLAUDE.md
 * "No dead ends") — mirrors apps/web's own global-error.tsx: React has
 * discarded the tree that normally provides `<html>`/`<body>` and
 * globals.css, so this file supplies both, inline, rather than assuming a
 * stylesheet or the `.tap-btn` component layer is present.
 */
import { THEME_COLORS } from '@newax/shared';

const N = THEME_COLORS.neutral;
// Rounded, big tap target — this surface's own idiom (`.tap-btn` in
// globals.css), not admin/storefront's 2px radius, hand-built because no
// stylesheet is guaranteed here.
const ACCENT = THEME_COLORS.accent.DEFAULT;

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
          backgroundColor: N[50],
          color: N[900],
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          padding: '1.5rem',
        }}
      >
        <div style={{ maxWidth: '24rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
            Something went badly wrong
          </h1>
          <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: N[600] }}>
            The till failed to start. Reloading usually clears it.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              minHeight: '4rem',
              width: '100%',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: ACCENT,
              color: THEME_COLORS.white,
              padding: '0 1.5rem',
              fontSize: '1.125rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {error.digest ? (
            <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: N[400] }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}

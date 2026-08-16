import type { ReactNode } from 'react';
import './globals.css';

/**
 * Root layout. Deliberately minimal: the storefront's <html> attributes depend
 * on the locale and are set in app/[locale]/layout.tsx, while /admin sets its
 * own. This one only carries the stylesheet.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}

'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * A page arrives. When the route changes, the new page's content rises into
 * place (a fade and 8px of travel over `normal`, on the `settle` curve) rather
 * than replacing the old one in a single frame, so a navigation reads as going
 * somewhere instead of the screen being swapped.
 *
 * Keyed on the pathname and nothing else, deliberately. A Next.js
 * `template.tsx` would do the same on every navigation, but it is keyed by the
 * segment, and a filter that writes `?status=paid` into the URL is a
 * navigation: the whole table would fade in again on every chip, which is
 * motion that delays the task. The pathname only changes when the page does.
 *
 * `backwards` fill (on `animate-rise`) and no `forwards`: once the animation is
 * over the element carries no `transform`, so nothing inside it is left with a
 * containing block it did not ask for. While it runs, a `position: fixed` child
 * is positioned against this element for the 220ms; nothing here renders one on
 * mount.
 *
 * Under reduced motion the stylesheet collapses the animation to one frame and
 * the content is simply there.
 */
export function PageEnter({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-rise">
      {children}
    </div>
  );
}

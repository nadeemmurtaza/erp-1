'use client';

import Lenis from 'lenis';
import { useEffect } from 'react';
import { prefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

export function SmoothScroller({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Smooth scrolling is JavaScript-driven motion, which the stylesheet's
    // reduced-motion rule cannot switch off: a reader who asked for none gets
    // the browser's own scrolling. (Whether the storefront should hijack the
    // wheel at all is a separate question; see ADR-083, fifth addendum.)
    if (prefersReducedMotion()) return;

    const lenis = new Lenis({
      smoothWheel: true,
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      wheelMultiplier: 1,
      touchMultiplier: 2,
    });

    let frameId: number;

    function raf(time: number) {
      lenis.raf(time);
      frameId = requestAnimationFrame(raf);
    }

    frameId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frameId);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}

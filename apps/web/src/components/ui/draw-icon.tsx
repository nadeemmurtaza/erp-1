'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

/** The SVG shapes that have a stroke to draw. A lucide icon is made of these and nothing else. */
const SHAPES = 'path, line, polyline, polygon, circle, ellipse, rect';

/**
 * A stroked icon that draws itself, once, when it appears.
 *
 * What it communicates: *this just happened*. A check that is drawn says the
 * action completed; one that is merely there says only that it is a check. It is
 * for the one icon that carries a result (a confirmation, a success state), not
 * for a toolbar or a row of them. Each stroke runs `slow` (320ms) on the
 * `settle` curve, and a second stroke starts one stagger step after the first,
 * so a tick is drawn before the ring around it.
 *
 * It wraps a stroked icon, `<DrawIcon><Check /></DrawIcon>`, and works on its
 * shapes by class (`.draw-path` in globals.css) once the icon is on the client:
 * on the server, and with no script, the icon is simply drawn. `pathLength="1"`
 * on each shape makes the dash a whole path whatever its length. Reduced motion
 * never marks the shapes, so the icon is plain.
 */
export function DrawIcon({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const box = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const root = box.current;
    if (!root || reduced) return;
    const shapes = Array.from(root.querySelectorAll<SVGGeometryElement>(SHAPES));
    shapes.forEach((shape, index) => {
      shape.setAttribute('pathLength', '1');
      shape.style.setProperty('--draw-index', String(index));
      shape.classList.add('draw-path');
    });
    return () => {
      shapes.forEach((shape) => {
        shape.classList.remove('draw-path');
        shape.style.removeProperty('--draw-index');
      });
    };
  }, [reduced]);

  return (
    <span ref={box} className={cn('inline-flex', className)}>
      {children}
    </span>
  );
}

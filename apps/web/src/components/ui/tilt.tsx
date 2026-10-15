'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, type ComponentProps, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/utils/cn';
import { tiltAngles } from '@/lib/motion';

/**
 * Lean a card toward the pointer (ADR-083, twelfth addendum). Returns the ref and handlers for
 * the element; the element must also carry `lift` and `tilt` (the classes), which is where the
 * transform lives. The hook only writes `--tilt-x` and `--tilt-y`, one animation frame at a time and
 * only for a mouse or a pen (a finger has no hover to lean toward), and puts them back to 0 when the
 * pointer leaves. The CSS that reads them is inside `(hover: hover) and (pointer: fine)` and
 * `prefers-reduced-motion: no-preference`, so under either of those nothing leans, whatever this writes.
 *
 * What it communicates: causation, "this surface is under your hand". It leans at most
 * `tilt.maxDeg` (4 degrees), so a grid of cards never reads as unstable.
 */
export function useTilt<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    if (event.pointerType === 'touch') return;
    const el = ref.current;
    if (!el) return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const box = el.getBoundingClientRect();
      const { x, y } = tiltAngles(clientX - box.left, clientY - box.top, box.width, box.height);
      el.style.setProperty('--tilt-x', `${x}deg`);
      el.style.setProperty('--tilt-y', `${y}deg`);
    });
  }, []);

  const onPointerLeave = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--tilt-x', '0deg');
    el.style.setProperty('--tilt-y', '0deg');
  }, []);

  return { ref, onPointerMove, onPointerLeave };
}

/** A `next/link` that is a card: it lifts (`.lift`) and leans (`.tilt`). The caller still gives it `card` and its own layout. */
export function TiltLink({ className, onPointerMove, onPointerLeave, ...rest }: ComponentProps<typeof Link>) {
  const tilt = useTilt<HTMLAnchorElement>();
  return (
    <Link
      {...rest}
      ref={tilt.ref}
      className={cn('lift tilt', className)}
      onPointerMove={(event) => {
        tilt.onPointerMove(event);
        onPointerMove?.(event);
      }}
      onPointerLeave={(event) => {
        tilt.onPointerLeave();
        onPointerLeave?.(event);
      }}
    />
  );
}

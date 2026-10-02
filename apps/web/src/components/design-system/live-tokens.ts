'use client';

import { useCallback, useEffect, useState } from 'react';
import { contrastRatio, compositeRgb } from '@newax/shared';
import { useTheme } from '@/hooks/use-theme';

type Rgb = [number, number, number];

/**
 * Reads the theme's colours back out of the browser, not out of brand.ts.
 *
 * The reference page exists to prove what the page PAINTS, so every number on
 * it is computed from the custom properties the stylesheet actually resolved
 * for the current theme. A token that drifted between brand.ts and the CSS
 * shows up here as a wrong value instead of a right-looking one.
 */
export function useLiveTokens() {
  const { resolved } = useTheme();
  // Bumped after the theme attribute has landed, so a re-read sees the new values.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVersion((v) => v + 1));
    return () => cancelAnimationFrame(frame);
  }, [resolved]);

  const rgb = useCallback(
    (name: string): Rgb | null => {
      // Nothing is read until after mount: the server has no computed style, so
      // the first client render has to match the server's (empty) one.
      if (version === 0 || typeof document === 'undefined') return null;
      const raw = getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
      const parts = raw.split(/\s+/).map(Number);
      return parts.length === 3 && parts.every(Number.isFinite) ? [parts[0]!, parts[1]!, parts[2]!] : null;
    },
    [version],
  );

  const hex = useCallback(
    (name: string): string | null => {
      const value = rgb(name);
      return value ? `#${value.map((v) => v.toString(16).padStart(2, '0')).join('')}` : null;
    },
    [rgb],
  );

  /** Contrast of `fg` (optionally translucent) over an opaque `bg`, both token names. */
  const contrast = useCallback(
    (fg: string, bg: string, alpha = 1): number | null => {
      const f = rgb(fg);
      const b = rgb(bg);
      if (!f || !b) return null;
      return contrastRatio(alpha === 1 ? f : compositeRgb(f, b, alpha), b);
    },
    [rgb],
  );

  return { resolved, rgb, hex, contrast };
}

'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_ATTRIBUTE,
  THEME_PALETTES,
  isThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@newax/shared';
import { STORAGE_KEYS } from '@/constants/storage';

/**
 * The theme, as a hook.
 *
 * There is no provider on purpose. The state is two facts that already live
 * outside React — the stored preference and the device's colour-scheme
 * media query — so this subscribes to them with `useSyncExternalStore`
 * rather than mirroring them into context and keeping the mirror honest. Any
 * number of components can call it and they cannot disagree.
 *
 * The first paint is not this hook's job: the inline script from
 * `themeInitScript` has already put `data-theme` on <html> by then, which is
 * what keeps a dark-mode visit from flashing white. This hook keeps the
 * attribute in step afterwards.
 *
 * On the server, and for the hydration render, the answer is `system`/`light`
 * — the same thing every server render says — and the client corrects itself
 * straight after, so there is no hydration mismatch to suppress.
 */

const QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  // Private windows and "block site data" make this throw, and a person who
  // cannot save a preference still gets a working page.
  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.theme);
    return isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

function apply(preference: ThemePreference): void {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, resolveTheme(preference, systemPrefersDark()));
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  const media = typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
  // The device switching theme (sunset, a control-centre toggle) only matters
  // to someone who chose `system`; `apply` re-resolves either way.
  const onMedia = () => {
    apply(readPreference());
    listener();
  };
  // Another tab changing the choice reaches this one through `storage`.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEYS.theme) return;
    apply(readPreference());
    listener();
  };

  media?.addEventListener('change', onMedia);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    media?.removeEventListener('change', onMedia);
    window.removeEventListener('storage', onStorage);
  };
}

export interface UseTheme {
  /** What the person chose. `system` until they choose. */
  preference: ThemePreference;
  /** What is painted right now. */
  resolved: ResolvedTheme;
  /** The palette for `resolved` — for the things CSS cannot reach (chart strokes, canvas). */
  palette: (typeof THEME_PALETTES)[ResolvedTheme];
  setPreference: (preference: ThemePreference) => void;
}

export function useTheme(): UseTheme {
  const preference = useSyncExternalStore(subscribe, readPreference, () => DEFAULT_THEME_PREFERENCE);
  const prefersDark = useSyncExternalStore(
    subscribe,
    systemPrefersDark,
    () => false,
  );
  const resolved = resolveTheme(preference, prefersDark);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.theme, next);
    } catch {
      // Not saved, but still applied for this visit.
    }
    apply(next);
    notify();
  }, []);

  return { preference, resolved, palette: THEME_PALETTES[resolved], setPreference };
}

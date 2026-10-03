/**
 * How a surface decides which theme it is in — plain functions, no framework.
 *
 * Web and the POS are separate Next apps with separate root layouts and will
 * not share a React provider, so the two pieces that MUST agree live here:
 * the rule that turns a preference into a theme, and the script that applies
 * it before first paint. Each app owns only its storage key and its toggle.
 *
 * A preference is what the person chose (`light`, `dark`, or `system` — follow
 * the OS, the default). A theme is what is actually painted. They differ only
 * for `system`, which is why both are named types.
 */

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'light' | 'dark';

/** The attribute on `<html>` that the CSS keys off (`[data-theme='dark']`). */
export const THEME_ATTRIBUTE = 'data-theme';

/** Where no choice has been made: follow the device. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/** The one rule: an explicit choice wins, `system` defers to the device. */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/**
 * The script a root layout inlines in `<head>`, so `data-theme` is on `<html>`
 * before the first paint. Without it the page paints light and then flips: a
 * flash of white on every load for everyone who chose dark.
 *
 * It is a string and not an import because it runs before any bundle does.
 * Failure modes, each handled rather than assumed away:
 *
 *   - `localStorage` throws (private window, blocked site data): the read is
 *     inside `try`, and the answer falls back to `system`.
 *   - `matchMedia` is missing: treated as light.
 *   - the stored value is garbage: treated as `system`.
 *   - the script itself throws: the attribute stays unset and the CSS media
 *     query (`prefers-color-scheme`) still gives the right theme — that is the
 *     reason the stylesheet has the `:root:not([data-theme])` fallback.
 *
 * Idempotent: running it twice sets the same attribute.
 */
export function themeInitScript(storageKey: string): string {
  const key = JSON.stringify(storageKey);
  return (
    `(function(){try{` +
    `var p=null;try{p=window.localStorage.getItem(${key})}catch(e){}` +
    `if(p!=='light'&&p!=='dark')p='system';` +
    `var d=p==='dark'||(p==='system'&&!!window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);` +
    `document.documentElement.setAttribute('${THEME_ATTRIBUTE}',d?'dark':'light')` +
    `}catch(e){}})();`
  );
}

import { themeInitScript } from '@newax/shared';
import { STORAGE_KEYS } from '@/constants/storage';

/**
 * Inline this in the `<head>` of every root layout that renders `<html>`.
 *
 * It puts `data-theme` on <html> before the first paint, from the stored
 * preference or, failing that, the device. Without it a dark-mode visit paints
 * light for a frame and then flips — the flash of white that makes a dark
 * theme feel broken. The script text comes from `@newax/shared`, which the POS
 * also uses, so the two apps apply the rule identically.
 *
 * A server component on purpose: React warns about a <script> rendered from a
 * client component, and this one must exist in the server HTML to run before
 * hydration. The matching `suppressHydrationWarning` on `<html>` is required,
 * because the attribute differs between the server's HTML and the client DOM
 * by design.
 */
export function ThemeInitScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeInitScript(STORAGE_KEYS.theme) }} />;
}

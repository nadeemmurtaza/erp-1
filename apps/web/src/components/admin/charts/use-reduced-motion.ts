/**
 * Moved to `@/hooks/use-prefers-reduced-motion` when the rest of the system
 * (dialogs, toasts, figures) needed the same answer. Kept as a re-export so the
 * seven chart files that import `./use-reduced-motion` did not have to change;
 * it can go once the owner confirms the deletion (CLAUDE.md: no file is
 * deleted without that).
 */
export { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

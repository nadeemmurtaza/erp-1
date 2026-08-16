import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware replacements for next/link and next/navigation. Import Link and
 * useRouter from here, never from next directly, so every internal link keeps
 * the reader in the language they are browsing in.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);

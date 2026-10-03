'use client';

import { useTranslations } from 'next-intl';
import { ThemeToggle } from '@/components/ui/theme-toggle';

/**
 * The storefront's theme control: the shared `ThemeToggle` in its one-button
 * shape, with the words in the customer's language. The primitive takes its
 * labels as props so it never imports an i18n layer; this is the only place
 * that knows the storefront is bilingual.
 */
export function ThemeSwitch() {
  const t = useTranslations('theme');
  return (
    <ThemeToggle
      variant="icon"
      labels={{
        group: t('group'),
        light: t('light'),
        dark: t('dark'),
        system: t('system'),
        switchToDark: t('switchToDark'),
        switchToLight: t('switchToLight'),
      }}
    />
  );
}

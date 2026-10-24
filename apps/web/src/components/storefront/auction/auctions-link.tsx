'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import { useEnabledModules } from '@/hooks/use-enabled-modules';
import { isModuleEnabled } from '@/utils/module-gate';

/**
 * The footer's way to the auction list, a list item that exists only when this
 * deployment runs the `auction` module (MOD-1). The header carries it too, from
 * the width it fits; this one is there at every width, so the list is never out of
 * reach.
 */
export function AuctionsFooterLink({ className }: { className: string }) {
  const t = useTranslations('nav');
  const modules = useEnabledModules();
  if (!modules || !isModuleEnabled('auction', modules)) return null;

  return (
    <li>
      <Link className={className} href={ROUTES.storefront.auctions}>
        {t('auctions')}
      </Link>
    </li>
  );
}

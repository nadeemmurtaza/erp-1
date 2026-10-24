import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { AuctionsFooterLink } from './auction/auctions-link';
import { Logo } from './logo';
import { ROUTES } from '@/constants/routes';
import type { CmsMenuLink } from '@/types/api';

/** A CMS-driven link renders as an external <a> when its URL isn't a local path. */
function FooterCmsLink({ item }: { item: CmsMenuLink }) {
  const className = 'text-sm text-neutral-200 hover:text-white transition-colors block';
  if (item.url.startsWith('/')) {
    return (
      <Link className={className} href={item.url}>
        {item.label}
      </Link>
    );
  }
  return (
    <a className={className} href={item.url} target="_blank" rel="noopener noreferrer">
      {item.label}
    </a>
  );
}

export function Footer({
  footerHelpMenu = [],
  footerAboutMenu = [],
}: {
  /** WO-8.1 — CMS-editable, additive to the four columns below. Empty by default. */
  footerHelpMenu?: CmsMenuLink[];
  footerAboutMenu?: CmsMenuLink[];
}) {
  const t = useTranslations('footer');
  const tSite = useTranslations('site');

  // Pinned to the light palette (`data-theme="light"`). The footer is a dark
  // band in both themes, and everything in it — neutral-200 links, neutral-500
  // eyebrows, `text-white` hovers — is written against the light ramp's values
  // (light text on #121111). A dark theme must not turn it into a pale band
  // with the same classes.
  return (
    <footer data-theme="light" className="mt-20 border-t border-neutral-800 bg-neutral-900">
      <div className="container-page py-16 sm:py-20">
        <div className="grid gap-12 sm:gap-16 sm:grid-cols-2 lg:grid-cols-4 mb-12">
          <div className="lg:col-span-1">
            {/* Matches the header. Reversed out of neutral-900 the strokes
                bloom, and at the old h-6 that closed the counters in `a` and
                both `e`s into blots — the word only reads properly from about
                h-8 up. No translate here: this logo is top-aligned in a column,
                not centred in a row. */}
            <Logo aria-label={tSite('name')} className="h-8 w-auto text-white" />
            <p className="mt-4 text-sm text-neutral-300 leading-relaxed">{tSite('tagline')}</p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">{t('help')}</h3>
            <ul className="mt-6 space-y-3">
              <li>
                <Link className="text-sm text-neutral-200 hover:text-white transition-colors block" href={ROUTES.storefront.contact}>
                  {t('contact')}
                </Link>
              </li>
              <li>
                <Link className="text-sm text-neutral-200 hover:text-white transition-colors block" href={ROUTES.storefront.shipping}>
                  {t('shipping')}
                </Link>
              </li>
              <li>
                <Link className="text-sm text-neutral-200 hover:text-white transition-colors block" href={ROUTES.storefront.returns}>
                  {t('returns')}
                </Link>
              </li>
              <li>
                <Link className="text-sm text-neutral-200 hover:text-white transition-colors block" href={ROUTES.storefront.sizeGuide}>
                  {t('sizeGuide')}
                </Link>
              </li>
              <li>
                <Link className="text-sm text-neutral-200 hover:text-white transition-colors block" href={ROUTES.storefront.verifyPurchase}>
                  {t('verifyPurchase')}
                </Link>
              </li>
              {footerHelpMenu.map((item) => (
                <li key={item.id}>
                  <FooterCmsLink item={item} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">{t('about')}</h3>
            <ul className="mt-6 space-y-3">
              <li>
                <Link className="text-sm text-neutral-200 hover:text-white transition-colors block" href={ROUTES.storefront.story}>
                  {t('story')}
                </Link>
              </li>
              <li>
                <Link className="text-sm text-neutral-200 hover:text-white transition-colors block" href={ROUTES.storefront.shopStitchingServices}>
                  {t('stitchingService')}
                </Link>
              </li>
              <AuctionsFooterLink className="text-sm text-neutral-200 hover:text-white transition-colors block" />
              {footerAboutMenu.map((item) => (
                <li key={item.id}>
                  <FooterCmsLink item={item} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Legal</h3>
            <ul className="mt-6 space-y-3">
              <li>
                <Link className="text-sm text-neutral-200 hover:text-white transition-colors" href={ROUTES.storefront.terms}>
                  Terms &amp; Conditions
                </Link>
              </li>
              <li>
                <Link className="text-sm text-neutral-200 hover:text-white transition-colors" href={ROUTES.storefront.privacy}>
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link className="text-sm text-neutral-200 hover:text-white transition-colors" href={ROUTES.storefront.returns}>
                  Returns &amp; Refunds
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-neutral-800 pt-8 flex flex-col items-center justify-center gap-6">
          <div className="flex gap-6">
            <Link className="text-xs text-neutral-500 hover:text-white transition-colors" href={ROUTES.storefront.privacy}>
              {t('privacyPolicy')}
            </Link>
            <Link className="text-xs text-neutral-500 hover:text-white transition-colors" href={ROUTES.storefront.terms}>
              {t('termsConditions')}
            </Link>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-xs text-neutral-500 tracking-wide">
              © {new Date().getFullYear()} {tSite('name')}. {t('rights')}
            </p>
            <p className="text-xs text-neutral-500 tracking-wide uppercase">
              Powered and developed by <a href="https://newax.co" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors underline underline-offset-2">newax.co</a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

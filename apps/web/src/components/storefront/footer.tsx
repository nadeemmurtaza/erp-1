import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export function Footer() {
  const t = useTranslations('footer');
  const tSite = useTranslations('site');
  const tCommon = useTranslations('common');

  return (
    <footer className="mt-20 border-t border-noir-800 bg-noir-900">
      <div className="container-page py-16 sm:py-20">
        <div className="grid gap-12 sm:gap-16 sm:grid-cols-2 lg:grid-cols-4 mb-12">
          <div className="lg:col-span-1">
            <p className="text-base font-semibold tracking-tight text-white">{tSite('name')}</p>
            <p className="mt-4 text-sm text-noir-300 leading-relaxed">{tSite('tagline')}</p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-noir-500">{t('help')}</h3>
            <ul className="mt-6 space-y-3">
              <li>
                <span className="text-sm text-noir-200 hover:text-white transition-colors cursor-default">
                  {t('contact')}
                </span>
              </li>
              <li>
                <span className="text-sm text-noir-200 hover:text-white transition-colors cursor-default">
                  {t('shipping')}
                </span>
              </li>
              <li>
                <span className="text-sm text-noir-200 hover:text-white transition-colors cursor-default">
                  {t('returns')}
                </span>
              </li>
              <li>
                <span className="text-sm text-noir-200 hover:text-white transition-colors cursor-default">
                  {t('sizeGuide')}
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-noir-500">{t('about')}</h3>
            <ul className="mt-6 space-y-3">
              <li>
                <span className="text-sm text-noir-200 hover:text-white transition-colors cursor-default">
                  {t('story')}
                </span>
              </li>
              <li>
                <Link className="text-sm text-noir-200 hover:text-white transition-colors" href="/shop?kind=STITCHING_SERVICE">
                  {t('stitchingService')}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-noir-500">{tCommon('currencyNote')}</h3>
            <p className="mt-6 text-sm text-noir-200 leading-relaxed">{t('payment')}</p>
          </div>
        </div>

        <div className="border-t border-noir-800 pt-8">
          <p className="text-xs text-noir-500 tracking-wide">
            © {new Date().getFullYear()} {tSite('name')}. {t('rights')}
          </p>
        </div>
      </div>
    </footer>
  );
}

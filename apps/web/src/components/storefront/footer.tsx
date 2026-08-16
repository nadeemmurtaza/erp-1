import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export function Footer() {
  const t = useTranslations('footer');
  const tSite = useTranslations('site');
  const tCommon = useTranslations('common');

  return (
    <footer className="mt-16 border-t border-sand-200 bg-white">
      <div className="container-page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-lg font-semibold text-brand-700">{tSite('name')}</p>
          <p className="mt-2 text-sm text-ink/70">{tSite('tagline')}</p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-ink">{t('help')}</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink/70">
            <li>{t('contact')}</li>
            <li>{t('shipping')}</li>
            <li>{t('returns')}</li>
            <li>{t('sizeGuide')}</li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-ink">{t('about')}</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink/70">
            <li>{t('story')}</li>
            <li>
              <Link className="hover:text-brand-700" href="/shop?kind=STITCHING_SERVICE">
                {t('stitchingService')}
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-ink">{tCommon('currencyNote')}</h2>
          <p className="mt-3 text-sm text-ink/70">{t('payment')}</p>
        </div>
      </div>

      <div className="border-t border-sand-200 py-4">
        <p className="container-page text-xs text-ink/50">
          © {new Date().getFullYear()} {tSite('name')}. {t('rights')}
        </p>
      </div>
    </footer>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { directionFor, type Locale } from '@yaseen/shared';
import { Link } from '@/i18n/navigation';
import clsx from 'clsx';

type NavItem = {
  key: string;
  href?: string;
  submenu?: Array<{ key: string; href: string }>;
};

export function MobileNav({
  items,
}: {
  items: ReadonlyArray<NavItem>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedSubmenu, setExpandedSubmenu] = useState<string | null>(null);
  const pathname = usePathname();
  const locale = useLocale() as Locale;
  const isRtl = directionFor(locale) === 'rtl';
  const t = useTranslations('nav');
  const tSite = useTranslations('site');

  // Close menu on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-md text-ink/80 hover:bg-sand-100 md:hidden"
        onClick={() => setIsOpen(true)}
        aria-label="Open menu"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </svg>
      </button>

      {isOpen && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm transition-opacity animate-fadeIn"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className={clsx(
            'fixed inset-y-0 w-4/5 max-w-sm bg-white shadow-xl flex flex-col',
            isRtl ? 'end-0 animate-slideInRight' : 'start-0 animate-slideInLeft'
          )}>
            <div className="flex items-center justify-between px-4 h-14 border-b border-sand-200">
              <span className="text-xl font-semibold tracking-tight text-brand-700">
                {tSite('name')}
              </span>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-md text-ink/80 hover:bg-sand-100"
                onClick={() => setIsOpen(false)}
                aria-label="Close menu"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            
            <div className="border-b border-sand-200 p-4">
              <div className="flex items-center gap-2 border-b-2 border-sand-300 focus-within:border-brand-600 transition-colors">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-ink/60 flex-shrink-0"
                >
                  <circle cx="8" cy="8" r="7" />
                  <path d="m13 13 3 3" />
                </svg>
                <input
                  type="search"
                  placeholder={t('searchPlaceholder')}
                  className="flex-1 border-0 bg-transparent py-2 text-sm placeholder-ink/40 focus:outline-none"
                />
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-1">
              {items.map((item) => {
                if (item.submenu) {
                  const isExpanded = expandedSubmenu === item.key;
                  return (
                    <div key={item.key}>
                      <button
                        onClick={() => setExpandedSubmenu(isExpanded ? null : item.key)}
                        className="w-full flex items-center justify-between rounded-md px-3 py-2 text-base font-medium text-ink hover:bg-sand-100"
                      >
                        {t(item.key)}
                        <svg
                          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      </button>
                      {isExpanded && (
                        <div className="flex flex-col gap-1 ps-4">
                          {item.submenu.map((subitem) => (
                            <Link
                              key={subitem.key}
                              href={subitem.href}
                              onClick={() => setIsOpen(false)}
                              className="rounded-md px-3 py-2 text-sm font-medium text-ink/70 hover:text-ink hover:bg-sand-100"
                            >
                              {t(subitem.key)}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.key}
                    href={item.href || '/'}
                    onClick={() => setIsOpen(false)}
                    className="rounded-md px-3 py-2 text-base font-medium text-ink hover:bg-sand-100"
                  >
                    {t(item.key)}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}

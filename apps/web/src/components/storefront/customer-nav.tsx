'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { logoutCustomer } from '@/lib/customer-client';
import { useCustomerSession } from './customer-session';

export function CustomerNav() {
  const { user, setUser, isLoading } = useCustomerSession();
  const router = useRouter();
  const t = useTranslations('nav'); // We can add translations if we want, or just use English

  if (isLoading) {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-sand-200" />;
  }

  if (user) {
    return (
      <div className="group relative">
        <button className="flex items-center gap-2 text-sm text-ink/70 transition-colors duration-200 hover:text-ink">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>

        {/* Dropdown menu */}
        <div className="absolute end-0 top-full mt-3 hidden w-48 rounded-lg border border-sand-200 bg-white p-4 shadow-md group-hover:block animate-fadeIn z-50">
          <div className="mb-3 pb-3 border-b border-sand-200">
            <p className="text-xs font-medium uppercase tracking-widest text-ink/50">{t('account')}</p>
            <p className="mt-2 text-sm text-ink">{user.email}</p>
          </div>
          <Link
            href="/orders"
            className="block py-2 text-sm text-ink/70 hover:text-ink transition-colors"
          >
            My Orders
          </Link>
          <button
            type="button"
            className="block w-full text-start py-2 text-sm text-red-600 hover:text-red-700 transition-colors"
            onClick={async () => {
              await logoutCustomer();
              setUser(null);
              router.refresh();
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      className="flex items-center gap-2 text-sm text-ink/70 transition-colors duration-200 hover:text-ink"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </Link>
  );
}

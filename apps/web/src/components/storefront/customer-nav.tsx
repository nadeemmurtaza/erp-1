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
      <div className="group relative flex items-center">
        <button className="flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-brand-700 hover:bg-sand-100">
          <span aria-hidden="true">👤</span>
          <span className="hidden sm:inline">{user.firstName ?? 'Account'}</span>
        </button>

        {/* Dropdown menu */}
        <div className="absolute right-0 top-full mt-1 hidden w-48 rounded-md border border-sand-200 bg-white p-2 shadow-lg group-hover:block">
          <div className="mb-2 border-b border-sand-100 pb-2 px-3 pt-1 text-sm text-ink/70">
            {user.email}
          </div>
          <Link
            href="/orders"
            className="block rounded-md px-3 py-2 text-sm text-ink hover:bg-sand-50"
          >
            My Orders
          </Link>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
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
      className="flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-brand-700 hover:bg-sand-100"
    >
      <span aria-hidden="true">👤</span>
      <span className="hidden sm:inline">Sign in</span>
    </Link>
  );
}

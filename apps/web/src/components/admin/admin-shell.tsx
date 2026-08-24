'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { clearSession, getStoredUser, logout } from '@/lib/admin-client';
import type { AuthUser } from '@/lib/api-types';
import { NAV_GROUP_LABELS, navFor, type AdminNavItem } from './nav-registry';
import { AdminSessionProvider } from './session';

/**
 * The back office frame: role guard, sidebar and header.
 *
 * Children are not rendered until a session is confirmed, so a page can fetch
 * on mount without first checking whether anyone is signed in — an
 * unauthenticated visit redirects instead of firing a request that can only 401.
 *
 * The guard runs in the browser because the admin holds its token there. That
 * is a convenience, not the security boundary — every /admin API route is
 * permission-checked server-side, so a forged local session gets 403s and
 * nothing else.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      router.replace('/admin/login');
      return;
    }
    setUser(stored);
    setChecked(true);
  }, [router]);

  useEffect(() => {
    if (isNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isNavOpen]);

  if (!checked || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-ink/50">
        Checking your session…
      </div>
    );
  }

  const items = navFor(user.permissions);
  const groups = [...new Set(items.map((item) => item.group))];

  return (
    <div className="flex min-h-screen bg-sand-50">
      {/* Mobile Drawer */}
      {isNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm transition-opacity animate-fadeIn"
            onClick={() => setIsNavOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-xl flex flex-col animate-slideInLeft">
            <div className="flex items-center justify-between px-4 h-14 border-b border-sand-200">
              <Link href="/admin" className="font-semibold text-brand-700" onClick={() => setIsNavOpen(false)}>
                Yaseen Admin
              </Link>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-md text-ink/80 hover:bg-sand-100"
                onClick={() => setIsNavOpen(false)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <nav className="p-3 flex-1 overflow-y-auto">
              {groups.map((group) => (
                <div key={group} className="mb-4">
                  <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink/40">
                    {NAV_GROUP_LABELS[group]}
                  </p>
                  <ul className="space-y-0.5">
                    {items
                      .filter((item) => item.group === group)
                      .map((item) => (
                        <li key={item.key}>
                          <NavLink item={item} pathname={pathname} onClick={() => setIsNavOpen(false)} />
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}

      <aside className="hidden w-60 shrink-0 border-e border-sand-200 bg-white lg:block">
        <div className="flex h-14 items-center border-b border-sand-200 px-4">
          <Link href="/admin" className="font-semibold text-brand-700">
            Yaseen Admin
          </Link>
        </div>

        <nav className="p-3">
          {groups.map((group) => (
            <div key={group} className="mb-4">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink/40">
                {NAV_GROUP_LABELS[group]}
              </p>
              <ul className="space-y-0.5">
                {items
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <li key={item.key}>
                      <NavLink item={item} pathname={pathname} />
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-4 border-b border-sand-200 bg-white px-4">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink/80 hover:bg-sand-100 lg:hidden"
            onClick={() => setIsNavOpen(true)}
            aria-label="Open menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" x2="20" y1="12" y2="12" />
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </button>

          <div className="ms-auto flex items-center gap-3 text-sm">
            <Link href="/en" className="text-ink/60 hover:text-brand-700">
              View store
            </Link>
            <span className="text-ink/40">|</span>
            <span className="text-ink/70">
              {user.firstName ?? user.email} · {user.role.toLowerCase()}
            </span>
            <button
              type="button"
              onClick={async () => {
                await logout();
                clearSession();
                router.replace('/admin/login');
              }}
              className="rounded-md px-2 py-1 text-ink/60 hover:bg-sand-100 hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <AdminSessionProvider value={user}>{children}</AdminSessionProvider>
        </main>
      </div>
    </div>
  );
}

function NavLink({
  item,
  pathname,
  compact = false,
  onClick,
}: {
  item: AdminNavItem;
  pathname: string;
  compact?: boolean;
  onClick?: () => void;
}) {
  // The dashboard is only active on an exact match; every other section stays
  // highlighted while you are inside its sub-pages.
  const isActive =
    item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      onClick={onClick}
      className={clsx(
        'block rounded-md px-3 py-2 text-sm transition-colors duration-200',
        compact && 'whitespace-nowrap',
        isActive
          ? 'bg-brand-50 font-medium text-brand-800'
          : 'text-ink/75 hover:bg-sand-100 hover:text-ink',
      )}
    >
      {item.label}
    </Link>
  );
}

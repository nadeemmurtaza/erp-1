'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { adminFetch, clearSession, getStoredUser, logout } from '@/lib/admin-client';
import type { AuthUser, DeploymentMeta } from '@/types/api';
import { NAV_GROUPS, ICON_MAP, navFor, type AdminNavItem } from './nav-registry';
import { AdminSessionProvider } from './session';
import { ROUTES } from '@/constants/routes';

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
  // Undefined = not fetched yet, so navFor() fails open (permissions-only)
  // rather than hiding every module-tagged nav item until this resolves.
  const [enabledModules, setEnabledModules] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored || !stored.permissions) {
      if (stored) clearSession();
      router.replace('/admin/login');
      return;
    }
    setUser(stored);
    setChecked(true);
  }, [router]);

  useEffect(() => {
    adminFetch<DeploymentMeta>('/meta')
      .then((meta) => setEnabledModules(meta.modules))
      .catch(() => undefined);
  }, []);

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
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-900/50">
        Checking your session…
      </div>
    );
  }

  const items = navFor(user.permissions, enabledModules);
  const allItems = items.flatMap(item => [item, ...(item.children || [])]);
  const activeItem = allItems.reduce((best, item) => {
    const isMatch = item.href === '/admin' 
      ? pathname === '/admin' 
      : (pathname === item.href || pathname.startsWith(item.href + '/'));
    if (isMatch) {
      if (!best || item.href.length > best.href.length) return item;
    }
    return best;
  }, null as AdminNavItem | null);

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Mobile Drawer */}
      {isNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm transition-opacity animate-fadeIn"
            onClick={() => setIsNavOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-xl flex flex-col animate-slideInLeft">
            <div className="flex items-center justify-between px-4 h-14 border-b border-neutral-100">
              <Link href={ROUTES.admin.dashboard} className="font-semibold text-accent-hover" onClick={() => setIsNavOpen(false)}>
                Yaseen Admin
              </Link>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-md text-neutral-900/80 hover:bg-white"
                onClick={() => setIsNavOpen(false)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <nav className="p-3 flex-1 overflow-y-auto">
              {NAV_GROUPS.map((group) => {
                const groupItems = items.filter((item) => item.group === group.key);
                if (groupItems.length === 0) return null;
                const GroupIcon = ICON_MAP[group.icon];
                return (
                  <div key={group.key} className="mb-4">
                    <div className="flex items-center gap-2 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-900/40">
                      {GroupIcon && <GroupIcon className="h-4 w-4" />}
                      <p>{group.label}</p>
                    </div>
                    <ul className="space-y-0.5">
                      {groupItems.map((item) => (
                        <li key={item.key}>
                          <NavItemNode item={item} activeItem={activeItem} onClick={() => setIsNavOpen(false)} />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      <aside className="hidden w-60 shrink-0 border-e border-neutral-100 bg-white lg:block">
        <div className="flex h-14 items-center border-b border-neutral-100 px-4">
          <Link href={ROUTES.admin.dashboard} className="font-semibold text-accent-hover">
            Yaseen Admin
          </Link>
        </div>

        <nav className="p-3">
          {NAV_GROUPS.map((group) => {
            const groupItems = items.filter((item) => item.group === group.key);
            if (groupItems.length === 0) return null;
            const GroupIcon = ICON_MAP[group.icon];
            return (
              <div key={group.key} className="mb-4">
                <div className="flex items-center gap-2 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-900/40">
                  {GroupIcon && <GroupIcon className="h-4 w-4" />}
                  <p>{group.label}</p>
                </div>
                <ul className="space-y-0.5">
                  {groupItems.map((item) => (
                    <li key={item.key}>
                      <NavItemNode item={item} activeItem={activeItem} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-4 border-b border-neutral-100 bg-white px-4">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-900/80 hover:bg-white lg:hidden"
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
            <Link href="/en" className="text-neutral-900/60 hover:text-accent-hover">
              View store
            </Link>
            <span className="text-neutral-900/40">|</span>
            <Link href={ROUTES.admin.account} className="text-neutral-900/70 hover:text-accent-hover">
              {user.firstName ?? user.email} · {user.role.toLowerCase()}
            </Link>
            <button
              type="button"
              onClick={async () => {
                await logout();
                clearSession();
                router.replace('/admin/login');
              }}
              className="rounded-md px-2 py-1 text-neutral-900/60 hover:bg-white hover:text-neutral-900"
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
  isActive,
  compact = false,
  onClick,
}: {
  item: AdminNavItem;
  isActive: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        'block rounded-md px-3 py-2 text-sm transition-colors duration-200',
        compact && 'whitespace-nowrap',
        isActive
          ? 'bg-neutral-50 font-medium text-accent-hover'
          : 'text-neutral-900/75 hover:bg-white hover:text-neutral-900',
      )}
    >
      {item.label}
    </Link>
  );
}


function NavItemNode({
  item,
  activeItem,
  onClick,
}: {
  item: AdminNavItem;
  activeItem: AdminNavItem | null;
  onClick?: () => void;
}) {
  const isActive = activeItem?.key === item.key;
  const hasActiveChild = item.children?.some(c => activeItem?.key === c.key) ?? false;
  
  const [isOpen, setIsOpen] = useState(isActive || hasActiveChild);

  useEffect(() => {
    if (hasActiveChild) setIsOpen(true);
  }, [hasActiveChild]);

  return (
    <div className="space-y-0.5">
      <div className="flex items-center">
        <div className="flex-1">
          <NavLink item={item} isActive={isActive} onClick={onClick} />
        </div>
        {item.children && item.children.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setIsOpen(!isOpen);
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-900/50 hover:bg-white hover:text-neutral-900 ms-1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn('transition-transform duration-200', isOpen && 'rotate-180')}
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        )}
      </div>
      {isOpen && item.children && item.children.length > 0 && (
        <ul className="ms-4 mt-1 space-y-0.5 border-s border-neutral-100 ps-2">
          {item.children.map((child) => (
            <li key={child.key}>
              <NavLink item={child} isActive={activeItem?.key === child.key} onClick={onClick} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

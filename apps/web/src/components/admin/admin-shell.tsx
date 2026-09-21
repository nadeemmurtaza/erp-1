'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { adminFetch, clearSession, getStoredUser, logout } from '@/lib/admin-client';
import type { AuthUser, DeploymentMeta } from '@/types/api';
import {
  NAV_GROUPS,
  ICON_MAP,
  navFor,
  type AdminNavGroup,
  type AdminNavItem,
} from './nav-registry';
import { CommandPalette } from './command-palette';
import { AdminProviders } from '@/providers/admin-providers';
import { ROUTES } from '@/constants/routes';
import { BRAND } from '@newax/shared';
import { STORAGE_KEYS } from '@/constants/storage';

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
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-900/60">
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
                {BRAND.identity.adminName}
              </Link>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-md text-neutral-900/80 hover:bg-neutral-50"
                onClick={() => setIsNavOpen(false)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <nav className="p-3 flex-1 overflow-y-auto">
              {NAV_GROUPS.map((group) => (
                <NavGroup
                  key={group.key}
                  group={group}
                  items={items}
                  activeItem={activeItem}
                  onNavigate={() => setIsNavOpen(false)}
                />
              ))}
            </nav>
          </div>
        </div>
      )}

      <aside className="hidden w-60 shrink-0 border-e border-neutral-100 bg-white lg:block">
        <div className="flex h-14 items-center border-b border-neutral-100 px-4">
          <Link href={ROUTES.admin.dashboard} className="font-semibold text-accent-hover">
            {BRAND.identity.adminName}
          </Link>
        </div>

        <nav className="p-3">
          {NAV_GROUPS.map((group) => (
            <NavGroup key={group.key} group={group} items={items} activeItem={activeItem} />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-4 border-b border-neutral-100 bg-white px-4">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-900/80 hover:bg-neutral-50 lg:hidden"
            onClick={() => setIsNavOpen(true)}
            aria-label="Open menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" x2="20" y1="12" y2="12" />
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </button>

          {/*
            Next to the menu button rather than in the corner: it is the one
            control on this bar somebody reaches for on purpose, and the
            shortcut printed on it is how that gets learned.
          */}
          <CommandPalette permissions={user.permissions} enabledModules={enabledModules} />

          <div className="ms-auto flex items-center gap-3 text-sm">
            <Link href="/en" className="text-neutral-900/60 hover:text-accent-hover">
              View store
            </Link>
            <span className="text-neutral-900/60">|</span>
            <Link href={ROUTES.admin.account} className="text-neutral-900/70 hover:text-accent-hover">
              {user.firstName ?? user.email} · {user.roles.join(', ') || 'No role assigned'}
            </Link>
            <button
              type="button"
              onClick={async () => {
                await logout();
                clearSession();
                router.replace('/admin/login');
              }}
              className="rounded-md px-2 py-1 text-neutral-900/60 hover:bg-neutral-50 hover:text-neutral-900"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <AdminProviders user={user} enabledModules={enabledModules}>
            {children}
          </AdminProviders>
        </main>
      </div>
    </div>
  );
}

/** Where the collapsed/expanded state of each nav group is remembered. */
const NAV_GROUPS_STORAGE_KEY = STORAGE_KEYS.admin.navGroups;

function readCollapsedGroups(): Record<string, boolean> {
  // Private windows and "block site data" make this throw rather than return
  // null, and a sidebar that cannot remember a preference should still open.
  try {
    const raw = window.localStorage.getItem(NAV_GROUPS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** A chevron that points down when open. Shared so the group and item toggles agree. */
function Chevron({ open }: { open: boolean }) {
  return (
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
      aria-hidden
      className={cn('shrink-0 transition-transform duration-200', open && 'rotate-180')}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/**
 * One collapsible section of the sidebar — Sales, Catalogue, Workshop and the
 * rest.
 *
 * The sidebar lists forty-odd destinations across nine groups, which is more
 * than fits on a laptop without scrolling, so the groups close. Two rules keep
 * closing them from ever hiding where you are: the group holding the current
 * page is forced open and its toggle is disabled, and the choice is remembered
 * per group rather than as one global "collapse all", because the groups a
 * given person never touches are not the same as anyone else's.
 *
 * Rendered by both the desktop aside and the mobile drawer. It used to be the
 * same twenty lines of markup written out twice, which is how the two came to
 * disagree in the first place.
 */
function NavGroup({
  group,
  items,
  activeItem,
  onNavigate,
}: {
  group: AdminNavGroup;
  items: AdminNavItem[];
  activeItem: AdminNavItem | null;
  onNavigate?: () => void;
}) {
  const groupItems = items.filter((item) => item.group === group.key);

  const holdsActivePage = groupItems.some(
    (item) =>
      activeItem?.key === item.key || item.children?.some((c) => activeItem?.key === c.key),
  );

  const [collapsed, setCollapsed] = useState(false);

  // Read after mount, not in the initialiser: the value is per-browser, and
  // rendering it on the first pass would differ from what the server produced.
  useEffect(() => {
    setCollapsed(readCollapsedGroups()[group.key] ?? false);
  }, [group.key]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(
        NAV_GROUPS_STORAGE_KEY,
        JSON.stringify({ ...readCollapsedGroups(), [group.key]: next }),
      );
    } catch {
      // Preference not persisted; the session still works.
    }
  }

  if (groupItems.length === 0) return null;

  const GroupIcon = ICON_MAP[group.icon];
  const open = holdsActivePage || !collapsed;
  const listId = `nav-group-${group.key}`;

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={toggle}
        disabled={holdsActivePage}
        aria-expanded={open}
        aria-controls={listId}
        className={cn(
          'flex w-full items-center gap-2 rounded px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-900/60 transition-colors duration-200',
          holdsActivePage ? 'cursor-default' : 'hover:text-neutral-900/70',
        )}
      >
        {GroupIcon && <GroupIcon className="h-4 w-4 shrink-0" />}
        <span className="flex-1 text-start">{group.label}</span>
        {!holdsActivePage && <Chevron open={open} />}
      </button>
      <ul id={listId} hidden={!open} className="space-y-0.5 pt-1">
        {groupItems.map((item) => (
          <li key={item.key}>
            <NavItemNode item={item} activeItem={activeItem} onClick={onNavigate} />
          </li>
        ))}
      </ul>
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
          : 'text-neutral-900/75 hover:bg-neutral-50 hover:text-neutral-900',
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
            aria-expanded={isOpen}
            aria-controls={`nav-children-${item.key}`}
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${item.label}`}
            className="ms-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-900/60 hover:bg-neutral-50 hover:text-neutral-900"
          >
            <Chevron open={isOpen} />
          </button>
        )}
      </div>
      {item.children && item.children.length > 0 && (
        <ul
          id={`nav-children-${item.key}`}
          hidden={!isOpen}
          className="ms-4 mt-1 space-y-0.5 border-s border-neutral-100 ps-2"
        >
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

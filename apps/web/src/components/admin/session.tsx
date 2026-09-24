'use client';

import { createContext, useContext, useMemo } from 'react';
import type { AuthUser } from '@/types/api';
import type { PermissionKey } from '@/constants/permissions';

const SessionContext = createContext<AuthUser | null>(null);

export const AdminSessionProvider = SessionContext.Provider;

/** The signed-in staff member, plus the one way to check what they can do. */
export interface AdminSession extends AuthUser {
  /**
   * Typed against `PermissionKey`, so a misspelled permission is a build
   * error instead of a call site that silently always returns `false` — the
   * exact failure mode `getStoredUser()?.permissions.includes('...')` had at
   * three dozen call sites across admin, each re-deriving the same check by
   * hand.
   */
  can: (key: PermissionKey) => boolean;
}

/**
 * The signed-in staff member.
 *
 * Only rendered beneath AdminShell, which does not render its children until a
 * session exists — so a page can fetch on mount without first checking whether
 * anyone is signed in, and an unauthenticated visit never fires a doomed
 * request.
 */
export function useAdminSession(): AdminSession {
  const user = useContext(SessionContext);
  if (!user) {
    throw new Error('useAdminSession must be used inside the admin shell');
  }
  // Memoized on the user object identity so `can` is stable across renders —
  // AdminShell only produces a new `user` reference when the session itself
  // changes, not on every render of a page that calls this hook.
  return useMemo(
    () => ({
      ...user,
      can: (key: PermissionKey) => user.permissions.includes(key),
    }),
    [user],
  );
}

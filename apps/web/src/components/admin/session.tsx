'use client';

import { createContext, useContext } from 'react';
import type { AuthUser } from '@/lib/api-types';

const SessionContext = createContext<AuthUser | null>(null);

export const AdminSessionProvider = SessionContext.Provider;

/**
 * The signed-in staff member.
 *
 * Only rendered beneath AdminShell, which does not render its children until a
 * session exists — so a page can fetch on mount without first checking whether
 * anyone is signed in, and an unauthenticated visit never fires a doomed
 * request.
 */
export function useAdminSession(): AuthUser {
  const user = useContext(SessionContext);
  if (!user) {
    throw new Error('useAdminSession must be used inside the admin shell');
  }
  return user;
}

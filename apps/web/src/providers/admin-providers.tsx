'use client';

import type { ReactNode } from 'react';
import type { AuthUser } from '@/types/api';
import { AdminSessionProvider } from '@/components/admin/session';
import { EnabledModulesProvider } from '@/components/admin/deployment-modules';

/**
 * Every context the back office runs on, in one place.
 *
 * The storefront already had `providers/storefront-providers.tsx`; admin's
 * single context was mounted inline in the middle of AdminShell's render
 * instead, which meant the two halves of the product answered "what contexts
 * are in scope here?" in two different ways — and adding a second admin
 * context would have meant editing the shell rather than this file.
 *
 * `user` is passed in rather than read here because AdminShell is what
 * establishes the session: it does not render children until one exists, so a
 * page beneath this can fetch on mount without first checking whether anyone
 * is signed in.
 */
export function AdminProviders({
  user,
  enabledModules,
  children,
}: {
  user: AuthUser;
  enabledModules: readonly string[] | undefined;
  children: ReactNode;
}) {
  return (
    <AdminSessionProvider value={user}>
      <EnabledModulesProvider value={enabledModules}>{children}</EnabledModulesProvider>
    </AdminSessionProvider>
  );
}

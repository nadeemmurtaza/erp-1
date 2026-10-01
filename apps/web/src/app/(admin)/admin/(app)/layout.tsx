'use client';

import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';
import { PageEnter } from '@/components/ui/page-enter';

/**
 * Wraps every signed-in back-office page in the shell.
 *
 * The route group exists so /admin/login sits outside it — the sign-in page
 * must not be inside the thing that redirects to sign-in.
 *
 * The page itself is wrapped in `PageEnter`, so every back-office screen arrives
 * the same way. The shell around it (header, navigation) does not move.
 */
export default function AdminAppLayout({ children }: { children: ReactNode }) {
  return (
    <AdminShell>
      <PageEnter>{children}</PageEnter>
    </AdminShell>
  );
}

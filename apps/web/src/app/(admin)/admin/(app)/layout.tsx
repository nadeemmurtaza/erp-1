'use client';

import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';

/**
 * Wraps every signed-in back-office page in the shell.
 *
 * The route group exists so /admin/login sits outside it — the sign-in page
 * must not be inside the thing that redirects to sign-in.
 */
export default function AdminAppLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '@/lib/auth-client';
import { STORAGE_KEYS } from '@/constants/storage';
import { ROUTES } from '@/constants/routes';

/** Routes to wherever this device's session actually is — never renders anything itself. */
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(ROUTES.login);
      return;
    }
    if (!localStorage.getItem(STORAGE_KEYS.terminalId)) {
      router.replace(ROUTES.selectTerminal);
      return;
    }
    if (!localStorage.getItem(STORAGE_KEYS.shiftId)) {
      router.replace(ROUTES.openShift);
      return;
    }
    router.replace(ROUTES.till);
  }, [router]);

  return null;
}

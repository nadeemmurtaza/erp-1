'use client';

import { useEffect, useState } from 'react';
import { request } from '@/lib/api-client';

/**
 * The API modules this deployment runs, from `GET /meta`, for a storefront
 * entry that exists only when its module does (MOD-1). One request per tab,
 * shared by every caller; a failed one is forgotten so the next caller asks
 * again.
 *
 * Returns `undefined` until the answer is known, and the caller decides what
 * unknown means. The admin treats it as "show" (`utils/module-gate`); the
 * storefront shows an entry for an off-by-default module only once it is
 * confirmed, because a link that leads to a page the deployment does not have
 * is worse than one that appears a moment late.
 */
let pending: Promise<readonly string[] | null> | null = null;

function loadModules(): Promise<readonly string[] | null> {
  pending ??= request<{ modules: string[] }>('/meta')
    .then((meta) => meta.modules)
    .catch(() => {
      pending = null;
      return null;
    });
  return pending;
}

export function useEnabledModules(): readonly string[] | undefined {
  const [modules, setModules] = useState<readonly string[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void loadModules().then((loaded) => {
      if (!cancelled && loaded) setModules(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return modules;
}

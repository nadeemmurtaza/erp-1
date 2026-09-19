'use client';

import { ApiError, publicRequest, request } from './api-client';
import { STORAGE_KEYS } from '@/constants/storage';

export interface PosUser {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  permissions: string[];
}

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: PosUser;
}

/**
 * A cashier signs into the till with the same staff account the admin
 * panel uses — `pos.operate` is a permission like any other (RETAIL-ERP.md
 * R10), so no separate credential system exists for this surface. Device
 * key auth (`PosTerminalsService.verifyDeviceKey()`) is issued and stored
 * but nothing calls it yet; wiring a device-level trust boundary on top of
 * the cashier's own session is real, separately-scoped work, not faked
 * here by pretending this app checks it today.
 */
export function getAccessToken(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem(STORAGE_KEYS.access);
}

export function getStoredUser(): PosUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEYS.user);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PosUser;
  } catch {
    return null;
  }
}

function storeSession(result: AuthResult): void {
  localStorage.setItem(STORAGE_KEYS.access, result.accessToken);
  localStorage.setItem(STORAGE_KEYS.refresh, result.refreshToken);
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(result.user));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEYS.access);
  localStorage.removeItem(STORAGE_KEYS.refresh);
  localStorage.removeItem(STORAGE_KEYS.user);
}

export async function login(identifier: string, password: string): Promise<PosUser> {
  const result = await publicRequest<AuthResult>('/auth/login', {
    method: 'POST',
    body: { identifier, password },
    fallbackMessage: 'Sign-in failed',
  });

  if (!result.user.permissions.includes('pos.operate')) {
    throw new ApiError(403, 'This account is not set up to operate a till.');
  }

  storeSession(result);
  return result.user;
}

export async function logout(): Promise<void> {
  const refreshToken = typeof window === 'undefined' ? null : localStorage.getItem(STORAGE_KEYS.refresh);
  clearSession();
  if (!refreshToken) return;
  await publicRequest('/auth/logout', { method: 'POST', body: { refreshToken }, expect: 'none' }).catch(() => undefined);
}

export { request };

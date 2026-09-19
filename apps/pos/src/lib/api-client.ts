'use client';

import { ApiError, request as sharedRequest, requestWithRefresh as sharedRequestWithRefresh, type RequestOptions } from '@newax/shared';
import { STORAGE_KEYS } from '@/constants/storage';

export { ApiError };
export type { RequestOptions };

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

function getAccessToken(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem(STORAGE_KEYS.access);
}

function getRefreshToken(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem(STORAGE_KEYS.refresh);
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEYS.access);
  localStorage.removeItem(STORAGE_KEYS.refresh);
  localStorage.removeItem(STORAGE_KEYS.user);
}

/** An unauthenticated call — only /auth/login and /auth/refresh use this. */
export function publicRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return sharedRequest<T>(API_URL, path, options);
}

let refreshInFlight: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  // Two calls racing a 401 at once must not both spend the refresh token —
  // the second refresh would fail against an already-rotated one and log
  // the cashier out mid-sale for no real reason.
  if (!refreshInFlight) {
    refreshInFlight = sharedRequest<{ accessToken: string; refreshToken: string }>(API_URL, '/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    })
      .then((result: { accessToken: string; refreshToken: string }) => {
        localStorage.setItem(STORAGE_KEYS.access, result.accessToken);
        localStorage.setItem(STORAGE_KEYS.refresh, result.refreshToken);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight ?? Promise.resolve(false);
}

/** The one HTTP call every authenticated screen makes — a 401 refreshes once and retries once, then signs out. */
export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return sharedRequestWithRefresh<T>(API_URL, path, options, {
    token: getAccessToken,
    refresh,
    onExpired: clearSession,
    expiredMessage: 'Session expired — sign in again.',
  });
}

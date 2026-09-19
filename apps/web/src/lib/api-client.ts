/**
 * The one HTTP layer. Every client in this directory goes through it.
 *
 * The actual implementation is `@newax/shared`'s http-client.ts — apps/pos
 * is a second consumer of the exact same "call fetch, check response.ok,
 * dig a message out of the body, throw an ApiError" logic this file used to
 * own outright, so it moved up a level. This file stays as the thin,
 * API_URL-bound adapter every existing import in apps/web already uses, so
 * no call site here changes.
 */
import {
  ApiError,
  messageOf,
  toSearchParams,
  request as sharedRequest,
  requestWithRefresh as sharedRequestWithRefresh,
  type RequestOptions,
} from '@newax/shared';

export { ApiError, messageOf, toSearchParams };
export type { RequestOptions };

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return sharedRequest<T>(API_URL, path, options);
}

export function requestWithRefresh<T>(
  path: string,
  options: RequestOptions,
  auth: {
    token: () => string | null;
    refresh: () => Promise<boolean>;
    onExpired: () => void;
    expiredMessage: string;
  },
): Promise<T> {
  return sharedRequestWithRefresh<T>(API_URL, path, options, auth);
}

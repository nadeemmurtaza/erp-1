import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * The one place the app talks to the API.
 *
 * Access and refresh tokens live in the secure store (the Keychain on iOS, the
 * Keystore on Android) rather than in AsyncStorage, because they are
 * credentials. The guest cart token is not a credential, so it stays in
 * AsyncStorage where it is cheap to read on every request.
 *
 * A 401 triggers one silent refresh and a single retry. A second failure signs
 * the customer out instead of looping.
 */

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  // The Android emulator reaches the host machine on 10.0.2.2, not localhost.
  (Platform.OS === 'android' ? 'http://10.0.2.2:3001/api/v1' : 'http://localhost:3001/api/v1');

/*
 * Namespaced to the builder, not the client — the same move the web app made
 * in its storage constants. A key carrying the client's name is a key that
 * has to be migrated at rebrand, and migrating a key silently signs everyone
 * out; `newax` never changes, so it never has to be.
 */
const NS = 'newax';
const ACCESS_KEY = `${NS}.access`;
const REFRESH_KEY = `${NS}.refresh`;
const CART_TOKEN_KEY = `${NS}.cartToken`;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let onSignedOut: (() => void) | null = null;

/** Lets the auth provider clear its state when a refresh finally fails. */
export function setSignOutHandler(handler: (() => void) | null): void {
  onSignedOut = handler;
}

/**
 * Where credentials live.
 *
 * The Keychain and the Keystore are the right place for a token on a phone, and
 * expo-secure-store is how you reach them — but it does not exist on web, where
 * every call throws. Web falls back to AsyncStorage, which is what a browser can
 * offer; the store is chosen once, here, so no caller has to know.
 */
const secureStore = {
  get: (key: string): Promise<string | null> =>
    Platform.OS === 'web' ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key),
  set: (key: string, value: string): Promise<void> =>
    Platform.OS === 'web'
      ? AsyncStorage.setItem(key, value)
      : SecureStore.setItemAsync(key, value),
  remove: (key: string): Promise<void> =>
    Platform.OS === 'web' ? AsyncStorage.removeItem(key) : SecureStore.deleteItemAsync(key),
};

export async function getAccessToken(): Promise<string | null> {
  return secureStore.get(ACCESS_KEY);
}

export async function storeTokens(access: string, refresh: string): Promise<void> {
  await secureStore.set(ACCESS_KEY, access);
  await secureStore.set(REFRESH_KEY, refresh);
}

export async function clearTokens(): Promise<void> {
  await secureStore.remove(ACCESS_KEY);
  await secureStore.remove(REFRESH_KEY);
}

export async function getCartToken(): Promise<string | null> {
  return AsyncStorage.getItem(CART_TOKEN_KEY);
}

export async function setCartToken(token: string): Promise<void> {
  await AsyncStorage.setItem(CART_TOKEN_KEY, token);
}

export async function clearCartToken(): Promise<void> {
  await AsyncStorage.removeItem(CART_TOKEN_KEY);
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined>;
  /** Skips the Authorization header even when signed in. */
  anonymous?: boolean;
}

export function toQuery(query: RequestOptions['query']): string {
  if (!query) return '';

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }

  const serialised = params.toString();
  return serialised ? `?${serialised}` : '';
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (!options.anonymous) {
      const token = await getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    // The guest cart is addressed by a token the API issues; the phone has no
    // cookie jar to keep it in, so it travels in a header.
    const cartToken = await getCartToken();
    if (cartToken) headers['x-cart-token'] = cartToken;

    let body: BodyInit | undefined;
    if (options.formData) {
      body = options.formData as unknown as BodyInit;
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    return fetch(`${API_URL}${path}${toQuery(options.query)}`, {
      method: options.method ?? 'GET',
      headers,
      body,
    });
  };

  let response: Response;
  try {
    response = await send();
  } catch (cause) {
    // fetch rejects with a TypeError when it cannot reach the host at all.
    // Anything else is a bug in this app, and reporting it as "offline" would
    // send someone to check their signal over a mistake of ours.
    if (cause instanceof TypeError) throw new ApiError(0, 'offline');
    throw cause;
  }

  if (response.status === 401 && !options.anonymous && (await refresh())) {
    response = await send();
  }

  if (response.status === 401 && !options.anonymous) {
    await clearTokens();
    onSignedOut?.();
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => undefined)) as
      | { message?: string | string[] }
      | undefined;
    const message = Array.isArray(errorBody?.message)
      ? errorBody?.message.join('\n')
      : errorBody?.message;
    throw new ApiError(response.status, message ?? `Request failed (${response.status})`, errorBody);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function refresh(): Promise<boolean> {
  const refreshToken = await secureStore.get(REFRESH_KEY);
  if (!refreshToken) return false;

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => null);

  if (!response?.ok) return false;

  const result = (await response.json()) as { accessToken: string; refreshToken: string };
  await storeTokens(result.accessToken, result.refreshToken);
  return true;
}

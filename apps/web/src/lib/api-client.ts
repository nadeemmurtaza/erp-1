/**
 * The one HTTP layer. Every client in this directory goes through it.
 *
 * There were six clients before — storefront, admin, customer, cart,
 * analytics, wishlist — and four of them had written their own copy of
 * "call fetch, check response.ok, dig a message out of the body, throw an
 * ApiError". The copies had drifted the way copies do: one joined a
 * `string[]` message with `'\n'` and another with `', '`, the defaults were
 * variously `'Could not update the cart'` and `` `Request failed with ${status}` ``,
 * and only some of them handled a 204 or a non-JSON body. A customer saw a
 * different error for the same API failure depending on which button they
 * pressed.
 *
 * This owns the parts that must not vary: building the URL, extracting an
 * error message, and turning a response into a value. What legitimately does
 * vary — which token to attach, what to do about a 401, whether the response
 * can be cached — stays with each client and is passed in.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

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

/** Turns a query object into a search string, dropping empties and flattening arrays. */
export function toSearchParams(query: Record<string, unknown>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }

  const search = params.toString();
  return search ? `?${search}` : '';
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Serialised to JSON with the right content-type. */
  body?: unknown;
  /**
   * Sent as-is for uploads. Content-Type is deliberately left unset so the
   * browser writes its own multipart boundary — setting it by hand produces a
   * body the server cannot parse.
   */
  formData?: FormData;
  /** Appended as a query string, empties dropped, arrays comma-joined. */
  query?: Record<string, unknown>;
  /** `json` (default) parses the body; `text` returns it raw; `none` ignores it. */
  expect?: 'json' | 'text' | 'none';
  /** Seconds for Next's fetch cache. 0 or undefined means no caching. */
  revalidate?: number;
  /**
   * Shown when the API gives no message of its own. Auth endpoints each want
   * their own ("Sign-in failed", "Could not send the reset email") because
   * `Request failed with 401` is not something to put in front of a customer.
   */
  fallbackMessage?: string;
}

/**
 * Pulls a human message out of whatever the API returned.
 *
 * Nest sends `message` as a string for a thrown exception and as a string[]
 * for a failed DTO validation, and the array is the case that matters — it is
 * one line per invalid field, so it has to keep its line breaks rather than
 * being run together into a paragraph.
 */
export function messageOf(body: unknown): string | undefined {
  if (typeof body === 'string') return body || undefined;
  if (!body || typeof body !== 'object') return undefined;

  const message = (body as { message?: unknown }).message;
  if (typeof message === 'string') return message || undefined;
  if (Array.isArray(message)) {
    const lines = message.filter((line): line is string => typeof line === 'string');
    return lines.length > 0 ? lines.join('\n') : undefined;
  }

  const error = (body as { error?: unknown }).error;
  return typeof error === 'string' ? error : undefined;
}

/** Reads the body once, as JSON if it can be, as text otherwise. */
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * One request. Throws ApiError on any non-2xx, with a message the UI can show
 * directly — no call site should ever have to interpret a status code to
 * produce user-facing words.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, formData, query, expect = 'json', revalidate, fallbackMessage, headers, ...init } =
    options;

  const url = `${API_URL}${path}${query ? toSearchParams(query) : ''}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(body === undefined || formData ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
    ...(revalidate && revalidate > 0
      ? { next: { revalidate } }
      : { cache: 'no-store' as RequestCache }),
  });

  if (!response.ok) {
    const failure = await readBody(response);
    throw new ApiError(
      response.status,
      messageOf(failure) ?? fallbackMessage ?? `Request failed with ${response.status}`,
      failure,
    );
  }

  if (expect === 'none' || response.status === 204) return undefined as T;
  if (expect === 'text') return (await response.text()) as T;

  const parsed = await readBody(response);
  return parsed as T;
}

/**
 * Wraps `request` with a 401 retry.
 *
 * Both signed-in clients need the same dance — try, and if the token has
 * expired, refresh once and try again exactly once, then give up with a
 * message that tells the person to sign in rather than a bare 401. They
 * differ only in *how* they refresh and where the token comes from, so those
 * are the two things passed in.
 */
export async function requestWithRefresh<T>(
  path: string,
  options: RequestOptions,
  auth: {
    /** Current access token, or null when there is no session. */
    token: () => string | null;
    /** Attempts a refresh. Resolves true when a new token is in place. */
    refresh: () => Promise<boolean>;
    /** Called when the session is beyond saving. */
    onExpired: () => void;
    expiredMessage: string;
  },
): Promise<T> {
  const send = () => {
    const token = auth.token();
    return request<T>(path, {
      ...options,
      headers: {
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };

  try {
    return await send();
  } catch (cause) {
    if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;

    if (await auth.refresh()) {
      try {
        return await send();
      } catch (retryCause) {
        if (!(retryCause instanceof ApiError) || retryCause.status !== 401) throw retryCause;
      }
    }

    auth.onExpired();
    throw new ApiError(401, auth.expiredMessage);
  }
}

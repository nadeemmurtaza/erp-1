/**
 * The one HTTP layer for a signed-in browser client.
 *
 * apps/web had six clients before this existed — storefront, admin,
 * customer, cart, analytics, wishlist — and four of them had written their
 * own copy of "call fetch, check response.ok, dig a message out of the
 * body, throw an ApiError". The copies had drifted the way copies do: one
 * joined a `string[]` message with `'\n'` and another with `', '`, and only
 * some handled a 204 or a non-JSON body. A customer saw a different error
 * for the same API failure depending on which button they pressed.
 *
 * This owns the parts that must not vary: building the URL, extracting an
 * error message, and turning a response into a value. What legitimately
 * varies — which token to attach, what to do about a 401, whether the
 * response can be cached — stays with each caller and is passed in.
 *
 * Framework-free (no Next.js import): `next: { revalidate }` is just a
 * plain fetch-init property Next's own fetch() interprets specially and any
 * other fetch() silently ignores, so this same file serves a Next app and a
 * plain browser client (apps/pos) alike — the second real consumer is what
 * moved this here from apps/web/src/lib/api-client.ts, per this repo's own
 * "two call sites want the same value" rule.
 */

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
   * browser writes its own multipart boundary — setting it by hand produces
   * a body the server cannot parse.
   */
  formData?: FormData;
  /** Appended as a query string, empties dropped, arrays comma-joined. */
  query?: Record<string, unknown>;
  /** `json` (default) parses the body; `text` returns it raw; `blob` returns it as a `Blob` (a file download); `none` ignores it. */
  expect?: 'json' | 'text' | 'blob' | 'none';
  /** Seconds for Next's fetch cache. 0 or undefined means no caching. Ignored by a non-Next caller. */
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
 * for a failed DTO validation, and the array is the case that matters — it
 * is one line per invalid field, so it has to keep its line breaks rather
 * than being run together into a paragraph.
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
 * One request. Throws ApiError on any non-2xx, with a message the UI can
 * show directly — no call site should ever have to interpret a status code
 * to produce user-facing words. `baseUrl` is passed in rather than baked in
 * here, since apps/web and apps/pos each read their own `NEXT_PUBLIC_*` env var.
 */
export async function request<T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { body, formData, query, expect = 'json', revalidate, fallbackMessage, headers, ...init } =
    options;

  const url = `${baseUrl}${path}${query ? toSearchParams(query) : ''}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(body === undefined || formData ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
    ...(revalidate && revalidate > 0 ? { next: { revalidate } } : { cache: 'no-store' as const }),
  } as RequestInit);

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
  if (expect === 'blob') return (await response.blob()) as T;

  const parsed = await readBody(response);
  return parsed as T;
}

/**
 * At most one run of `task` in flight at a time: a call made while a run is
 * pending gets that run's own promise, and the first call after it settles
 * starts a fresh one. A failed run is shared the same way and never wedges
 * the next call.
 *
 * Every client wraps its refresh-token exchange in this
 * (206-rate-limiting-caching-compression-hardening.md §2.2, WO-206.4). A page
 * whose five requests all get a 401 at once must send one `/auth/refresh`,
 * not five: five would each present the same refresh token, and that is the
 * rotation race that signs a person out for no reason. The API's 10-second
 * grace window catches what gets past this — two tabs, a retried request —
 * but one tab never needs it.
 */
export function singleFlight<T>(task: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (!inFlight) {
      inFlight = task().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}

/**
 * Wraps `request` with a 401 retry.
 *
 * Every signed-in client needs the same dance — try, and if the token has
 * expired, refresh once and try again exactly once, then give up with a
 * message that tells the person to sign in rather than a bare 401. They
 * differ only in *how* they refresh and where the token comes from, so
 * those are the two things passed in.
 */
export async function requestWithRefresh<T>(
  baseUrl: string,
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
    return request<T>(baseUrl, path, {
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

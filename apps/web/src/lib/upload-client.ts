import { adminAuth } from '@/lib/admin-client';
import { API_URL, ApiError, messageOf, toSearchParams } from '@/lib/api-client';

/**
 * The upload transport: one multipart POST that can say how far it has got.
 *
 * `fetch` reports no upload progress, so an honest bar (UPL-2) needs
 * `XMLHttpRequest`. This is the only module in the web app that uses it; every
 * other call goes through `request()` / `adminFetch()` and a page never
 * touches it directly (the upload hook and provider do).
 *
 * It authenticates exactly as `adminFetch` does, through the same `adminAuth`:
 * the bearer token, `credentials: 'include'`, and on a 401 ONE refresh through
 * the existing single-flight flow and ONE retry, after which an expired session
 * signs the person out rather than looping. An error message is the server's own
 * (`messageOf`, the extractor `requestWithRefresh` uses), so an upload fails in
 * the same words as any other request.
 *
 * Failure and retry story. A dropped connection, a non-2xx answer and a 401 that
 * cannot be recovered each reject with an `ApiError` the tray shows on that
 * file's lane with a Retry. A retry re-sends the whole file: nothing here
 * resumes a partial body, so a route that must not store a file twice has to be
 * idempotent on its own: pass the `Idempotency-Key` header (`headers`) to a route
 * the API guards with `@IdempotentWrite`, and the same key on every retry makes
 * the second request a no-op. No route this app uploads to is guarded that way
 * today; the header is passed through, not assumed.
 *
 * There is no client-side timeout on purpose. A 48 MB photograph on a slow link
 * legitimately takes minutes, and a timer that aborted it would turn a slow
 * upload into a failed one; the person has Cancel on the lane, and the server
 * and its proxy own their own limits.
 */
export interface UploadRequest {
  /** The route, after the API base: `/admin/catalog/products/:id/images`. */
  path: string;
  file: File;
  /** The multipart field the route's `FileInterceptor` reads: `file` for most routes, `photo` for stitching. */
  field?: string;
  /** Other multipart fields (an `alt` text), sent before the file. */
  fields?: Readonly<Record<string, string>>;
  query?: Record<string, unknown>;
  method?: 'POST' | 'PUT' | 'PATCH';
  /** Extra headers, such as `Idempotency-Key`. `Content-Type` is never set: the browser writes the multipart boundary. */
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  /**
   * Requests that share a key are sent one at a time, in the order they were
   * made, whatever the queue's concurrency. For a route whose server computes
   * something from what is already stored before it saves (a product image takes
   * `order` and `isPrimary` from the count it read first): two sent together read
   * the same count, and both claim the same place. A failure or a cancel in the
   * line never blocks the next.
   */
  serialKey?: string;
  /**
   * Bytes of the request body sent so far, and the body's total, or 0 when the
   * browser cannot say (the caller then draws no number). Called again from the
   * start if the request is re-sent after a token refresh.
   */
  onProgress?: (loaded: number, total: number) => void;
}

/** What a person is told when the connection fails before any answer: what happened and what to do (FLO-7). */
export const NETWORK_MESSAGE = 'The connection dropped before the upload finished. Check your network and retry.';

/** The error an aborted upload rejects with: the platform's own, so `fetch` and this agree on what a cancel looks like. */
function abortError(): DOMException {
  return new DOMException('The upload was canceled.', 'AbortError');
}

/** Whether `error` is a cancel, which is an outcome and never a failure. */
export function isUploadAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

interface Answer {
  status: number;
  body: unknown;
}

/** The body as JSON if it is, as text otherwise, nothing if empty: the same reading `request()` gives a response. */
function readBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildForm(request: UploadRequest): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(request.fields ?? {})) form.append(name, value);
  // Fields first: a multipart parser reads them before the file part arrives, so a route that needs `alt` while handling the file has it.
  form.append(request.field ?? 'file', request.file, request.file.name);
  return form;
}

/** One request, resolved with whatever the server answered. A refusal is not an error here: the caller reads the status. */
function send(request: UploadRequest, form: FormData, token: string | null): Promise<Answer> {
  return new Promise<Answer>((resolve, reject) => {
    const { signal } = request;
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const xhr = new XMLHttpRequest();
    const query = request.query ? toSearchParams(request.query) : '';
    xhr.open(request.method ?? 'POST', `${API_URL}${request.path}${query}`);
    xhr.withCredentials = true;
    xhr.responseType = 'text';
    xhr.setRequestHeader('Accept', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    for (const [name, value] of Object.entries(request.headers ?? {})) xhr.setRequestHeader(name, value);

    const onAbort = () => xhr.abort();
    const settle = () => signal?.removeEventListener('abort', onAbort);
    signal?.addEventListener('abort', onAbort, { once: true });

    xhr.upload.onprogress = (event) => request.onProgress?.(event.loaded, event.lengthComputable ? event.total : 0);
    xhr.onload = () => {
      settle();
      resolve({ status: xhr.status, body: readBody(xhr.responseText) });
    };
    xhr.onerror = () => {
      settle();
      reject(new ApiError(0, NETWORK_MESSAGE));
    };
    xhr.onabort = () => {
      settle();
      reject(abortError());
    };

    xhr.send(form);
  });
}

/** A proxy's 413 page is HTML, and a message of `<html>…` is not for a person. */
const looksLikeHtml = (text: string) => /^\s*</.test(text);

function failureMessage(status: number, body: unknown): string {
  const own = messageOf(body);
  if (own && !looksLikeHtml(own)) return own;
  if (status === 413) return 'The server refused this file as too large. Choose a smaller one.';
  return `The server could not take this file (error ${status}). Try again.`;
}

/** The end of each `serialKey`'s line. It never rejects, so one request's failure cannot stop the next. */
const lines = new Map<string, Promise<void>>();

async function inLine<T>(key: string | undefined, signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T> {
  if (!key) return task();
  const run = (lines.get(key) ?? Promise.resolve()).then(() => {
    // Canceled while waiting its turn: never sent.
    if (signal?.aborted) throw abortError();
    return task();
  });
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  lines.set(key, tail);
  // An idle line is forgotten, so keys do not accumulate.
  void tail.then(() => {
    if (lines.get(key) === tail) lines.delete(key);
  });
  return run;
}

/**
 * Sends the file and resolves with the parsed response body. Rejects with an
 * `ApiError` for a failure (its `message` is the server's own), and with an
 * `AbortError` (`isUploadAbort`) when `signal` aborts.
 */
export function uploadFile<T = unknown>(request: UploadRequest): Promise<T> {
  return inLine(request.serialKey, request.signal, () => transfer<T>(request));
}

async function transfer<T>(request: UploadRequest): Promise<T> {
  const form = buildForm(request);
  let answer = await send(request, form, adminAuth.token());

  if (answer.status === 401) {
    // One refresh, one retry, then give up: the same two chances `requestWithRefresh` gives any request.
    if (await adminAuth.refresh()) answer = await send(request, form, adminAuth.token());
    if (answer.status === 401) {
      adminAuth.onExpired();
      throw new ApiError(401, adminAuth.expiredMessage);
    }
  }

  if (answer.status < 200 || answer.status >= 300) {
    throw new ApiError(answer.status, failureMessage(answer.status, answer.body), answer.body);
  }
  return answer.body as T;
}

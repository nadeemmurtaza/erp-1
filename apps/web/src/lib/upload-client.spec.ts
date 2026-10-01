import { vi } from 'vitest';
import { ApiError } from '@/lib/api-client';

/**
 * The transport has two things worth a spec: that it authenticates and recovers
 * from a 401 exactly as `adminFetch` does (one refresh, one retry, then sign
 * out), and that every way it can fail ends in words a person can act on. A
 * fake `XMLHttpRequest` stands in for the browser; nothing touches a network.
 */

const auth = vi.hoisted(() => ({
  token: vi.fn<() => string | null>(),
  refresh: vi.fn<() => Promise<boolean>>(),
  onExpired: vi.fn<() => void>(),
  expiredMessage: 'Your session has expired. Please sign in again.',
}));

vi.mock('@/lib/admin-client', () => ({ adminAuth: auth }));

import { NETWORK_MESSAGE, isUploadAbort, uploadFile } from './upload-client';

type Behaviour = (xhr: FakeXhr) => void;

class FakeXhr {
  static instances: FakeXhr[] = [];
  static script: Behaviour[] = [];

  method = '';
  url = '';
  headers: Record<string, string> = {};
  withCredentials = false;
  responseType = '';
  status = 0;
  responseText = '';
  body: unknown = null;
  aborted = false;
  upload: { onprogress: ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
    const behave = FakeXhr.script.shift();
    if (behave) queueMicrotask(() => behave(this));
  }
  abort() {
    this.aborted = true;
    queueMicrotask(() => this.onabort?.());
  }
  progress(loaded: number, total: number, lengthComputable = true) {
    this.upload.onprogress?.({ loaded, total, lengthComputable });
  }
  answer(status: number, body: unknown) {
    this.status = status;
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
    this.onload?.();
  }
}

const file = () => new File([new Uint8Array(10)], 'hero.png', { type: 'image/png' });

beforeEach(() => {
  FakeXhr.instances = [];
  FakeXhr.script = [];
  auth.token.mockReset().mockReturnValue('token-1');
  auth.refresh.mockReset();
  auth.onExpired.mockReset();
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadFile: the request', () => {
  it('posts the file as multipart with the bearer token and credentials, and no Content-Type', async () => {
    FakeXhr.script = [(xhr) => xhr.answer(201, { id: 'img-1' })];
    const result = await uploadFile<{ id: string }>({ path: '/admin/catalog/products/p1/images', file: file() });

    expect(result).toEqual({ id: 'img-1' });
    const xhr = FakeXhr.instances[0]!;
    expect(xhr.method).toBe('POST');
    expect(xhr.url.endsWith('/admin/catalog/products/p1/images')).toBe(true);
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer token-1' });
    expect(xhr.headers['Content-Type']).toBeUndefined();
    const form = xhr.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect((form.get('file') as File).name).toBe('hero.png');
  });

  it('uses the field the route reads, sends other fields first, and appends the query', async () => {
    FakeXhr.script = [(xhr) => xhr.answer(200, {})];
    await uploadFile({
      path: '/admin/stitching/jobs/j1/stage',
      file: file(),
      field: 'photo',
      fields: { stage: 'CUTTING', note: 'ok' },
      query: { dryRun: 'true', skipped: '' },
    });
    const xhr = FakeXhr.instances[0]!;
    expect(xhr.url.endsWith('/admin/stitching/jobs/j1/stage?dryRun=true')).toBe(true);
    const form = xhr.body as FormData;
    expect([...form.keys()]).toEqual(['stage', 'note', 'photo']);
  });

  it('passes an Idempotency-Key through, and sends no Authorization with no session', async () => {
    auth.token.mockReturnValue(null);
    FakeXhr.script = [(xhr) => xhr.answer(200, {})];
    await uploadFile({ path: '/x', file: file(), headers: { 'Idempotency-Key': 'k-1' } });
    expect(FakeXhr.instances[0]!.headers).toEqual({ Accept: 'application/json', 'Idempotency-Key': 'k-1' });
  });

  it('reports how far it has got, and 0 for a total the browser cannot give', async () => {
    const seen: Array<[number, number]> = [];
    FakeXhr.script = [
      (xhr) => {
        xhr.progress(100, 400);
        xhr.progress(250, 0, false);
        xhr.answer(200, {});
      },
    ];
    await uploadFile({ path: '/x', file: file(), onProgress: (loaded, total) => seen.push([loaded, total]) });
    expect(seen).toEqual([
      [100, 400],
      [250, 0],
    ]);
  });

  it('resolves with undefined for an empty body and with text for a non-JSON one', async () => {
    FakeXhr.script = [(xhr) => xhr.answer(204, '')];
    expect(await uploadFile({ path: '/x', file: file() })).toBeUndefined();
    FakeXhr.script = [(xhr) => xhr.answer(200, 'plain')];
    expect(await uploadFile({ path: '/x', file: file() })).toBe('plain');
  });
});

describe('uploadFile: a 401 (the same two chances as adminFetch)', () => {
  it('refreshes once and re-sends with the new token', async () => {
    auth.token.mockReturnValueOnce('old').mockReturnValueOnce('new');
    auth.refresh.mockResolvedValue(true);
    FakeXhr.script = [(xhr) => xhr.answer(401, { message: 'expired' }), (xhr) => xhr.answer(201, { id: 'ok' })];

    expect(await uploadFile({ path: '/x', file: file() })).toEqual({ id: 'ok' });
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(FakeXhr.instances.map((xhr) => xhr.headers.Authorization)).toEqual(['Bearer old', 'Bearer new']);
    expect(auth.onExpired).not.toHaveBeenCalled();
  });

  it('signs the person out when the refresh fails, with the session message', async () => {
    auth.refresh.mockResolvedValue(false);
    FakeXhr.script = [(xhr) => xhr.answer(401, {})];
    await expect(uploadFile({ path: '/x', file: file() })).rejects.toMatchObject({
      status: 401,
      message: 'Your session has expired. Please sign in again.',
    });
    expect(auth.onExpired).toHaveBeenCalledTimes(1);
    expect(FakeXhr.instances).toHaveLength(1);
  });

  it('retries only once: a second 401 signs out and never loops', async () => {
    auth.refresh.mockResolvedValue(true);
    FakeXhr.script = [(xhr) => xhr.answer(401, {}), (xhr) => xhr.answer(401, {})];
    await expect(uploadFile({ path: '/x', file: file() })).rejects.toBeInstanceOf(ApiError);
    expect(FakeXhr.instances).toHaveLength(2);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(auth.onExpired).toHaveBeenCalledTimes(1);
  });

  it('reports the failure of the retry as itself, not as an expired session', async () => {
    auth.refresh.mockResolvedValue(true);
    FakeXhr.script = [
      (xhr) => xhr.answer(401, {}),
      (xhr) => xhr.answer(403, { message: 'You may not attach images.' }),
    ];
    await expect(uploadFile({ path: '/x', file: file() })).rejects.toMatchObject({
      status: 403,
      message: 'You may not attach images.',
    });
    expect(auth.onExpired).not.toHaveBeenCalled();
  });
});

describe('uploadFile: failures end in words a person can act on (FLO-7)', () => {
  it("carries the server's own message", async () => {
    FakeXhr.script = [(xhr) => xhr.answer(400, { message: 'Image is larger than 8MB.' })];
    await expect(uploadFile({ path: '/x', file: file() })).rejects.toMatchObject({
      status: 400,
      message: 'Image is larger than 8MB.',
    });
  });

  it('joins a validation list with line breaks, the way request() does', async () => {
    FakeXhr.script = [(xhr) => xhr.answer(400, { message: ['alt must be a string', 'locale is required'] })];
    await expect(uploadFile({ path: '/x', file: file() })).rejects.toMatchObject({
      message: 'alt must be a string\nlocale is required',
    });
  });

  it('says "too large" for a proxy\'s HTML 413 page rather than printing markup', async () => {
    FakeXhr.script = [(xhr) => xhr.answer(413, '<html><body>413 Request Entity Too Large</body></html>')];
    await expect(uploadFile({ path: '/x', file: file() })).rejects.toMatchObject({
      status: 413,
      message: 'The server refused this file as too large. Choose a smaller one.',
    });
  });

  it('names the status when the server gives no message', async () => {
    FakeXhr.script = [(xhr) => xhr.answer(503, '')];
    await expect(uploadFile({ path: '/x', file: file() })).rejects.toMatchObject({
      status: 503,
      message: 'The server could not take this file (error 503). Try again.',
    });
  });

  it('says what happened and what to do when the connection drops', async () => {
    FakeXhr.script = [(xhr) => xhr.onerror?.()];
    await expect(uploadFile({ path: '/x', file: file() })).rejects.toMatchObject({
      status: 0,
      message: NETWORK_MESSAGE,
    });
  });
});

describe('uploadFile: cancel', () => {
  it('aborts the request and rejects with an AbortError that is not a failure', async () => {
    const controller = new AbortController();
    FakeXhr.script = [() => controller.abort()];
    const pending = uploadFile({ path: '/x', file: file(), signal: controller.signal });
    await expect(pending).rejects.toSatisfy(isUploadAbort);
    expect(FakeXhr.instances[0]!.aborted).toBe(true);
  });

  it('never sends when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(uploadFile({ path: '/x', file: file(), signal: controller.signal })).rejects.toSatisfy(isUploadAbort);
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('stops before the re-send when the person cancels while the token refreshes', async () => {
    const controller = new AbortController();
    auth.refresh.mockImplementation(async () => {
      controller.abort();
      return true;
    });
    FakeXhr.script = [(xhr) => xhr.answer(401, {})];
    await expect(uploadFile({ path: '/x', file: file(), signal: controller.signal })).rejects.toSatisfy(isUploadAbort);
    expect(FakeXhr.instances).toHaveLength(1);
  });

  it('does not take an ordinary error for a cancel', () => {
    expect(isUploadAbort(new Error('boom'))).toBe(false);
    expect(isUploadAbort(new ApiError(0, NETWORK_MESSAGE))).toBe(false);
    expect(isUploadAbort(null)).toBe(false);
  });
});

describe('uploadFile: serialKey (a route whose server reads before it saves)', () => {
  /** A request the test answers by hand, so it can see what has been sent while another is open. */
  const open = () => {
    const pending: FakeXhr[] = [];
    FakeXhr.script = Array.from({ length: 4 }, () => (xhr: FakeXhr) => void pending.push(xhr));
    return pending;
  };
  // Each test has its own key: a line left open by one must not hold up the next.
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('sends requests that share a key one at a time, in the order made', async () => {
    const pending = open();
    const first = uploadFile({ path: '/p/1/images', file: file(), serialKey: 'line-0-a' });
    const second = uploadFile({ path: '/p/1/images', file: file(), serialKey: 'line-0-a' });
    await tick();
    expect(FakeXhr.instances).toHaveLength(1);

    pending[0]!.answer(201, { id: 'a' });
    await first;
    await tick();
    expect(FakeXhr.instances).toHaveLength(2);

    pending[1]!.answer(201, { id: 'b' });
    expect(await second).toEqual({ id: 'b' });
  });

  it('sends requests with different keys together', async () => {
    open();
    void uploadFile({ path: '/p/1/images', file: file(), serialKey: 'line-1-a' });
    void uploadFile({ path: '/p/2/images', file: file(), serialKey: 'line-1-b' });
    void uploadFile({ path: '/p/3/images', file: file() });
    await tick();
    expect(FakeXhr.instances).toHaveLength(3);
  });

  it('lets a failure in the line go to its own request and never block the next', async () => {
    const pending = open();
    const first = uploadFile({ path: '/p/1/images', file: file(), serialKey: 'line-2-a' });
    const second = uploadFile({ path: '/p/1/images', file: file(), serialKey: 'line-2-a' });
    await tick();
    pending[0]!.answer(400, { message: 'That file is not a valid image.' });
    await expect(first).rejects.toMatchObject({ message: 'That file is not a valid image.' });
    await tick();
    pending[1]!.answer(201, { id: 'b' });
    expect(await second).toEqual({ id: 'b' });
  });

  it('never sends a request canceled while it waited for its turn', async () => {
    const pending = open();
    const controller = new AbortController();
    const first = uploadFile({ path: '/p/1/images', file: file(), serialKey: 'line-3-a' });
    const waiting = uploadFile({ path: '/p/1/images', file: file(), serialKey: 'line-3-a', signal: controller.signal });
    const third = uploadFile({ path: '/p/1/images', file: file(), serialKey: 'line-3-a' });
    await tick();
    controller.abort();
    pending[0]!.answer(201, { id: 'a' });
    await first;
    await expect(waiting).rejects.toSatisfy(isUploadAbort);
    await tick();
    // The canceled one was skipped: the third is the second request sent.
    expect(FakeXhr.instances).toHaveLength(2);
    pending[1]!.answer(201, { id: 'c' });
    expect(await third).toEqual({ id: 'c' });
  });
});

import type { Response } from 'express';
import { AuctionPublicController, openEventStream } from './auction-public.controller';
import { CLIENT_RETRY_MS } from './auction-realtime.service';

/**
 * launchpad-apps/234-auction-app.md WO-234.4: the transport half of the live
 * stream. The service writes frames to a plain stream; this controller is what
 * turns a response into a server-sent-events one and says no, with a reason the
 * page can act on, when the node is full. That a real HTTP client receives it
 * all is `test/auction-realtime.e2e-spec.ts`'s.
 */
class FakeResponse {
  statusCode = 0;
  headers: Record<string, string> = {};
  flushed = false;
  body: unknown = null;

  status(code: number) {
    this.statusCode = code;
    return this;
  }
  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }
  flushHeaders() {
    this.flushed = true;
  }
  json(body: unknown) {
    this.body = body;
    return this;
  }
}

const SNAPSHOT = { lotId: 'l1' };

describe('AuctionPublicController stream', () => {
  const build = (hasRoom: boolean) => {
    const publicLots = { liveSnapshot: jest.fn().mockResolvedValue(SNAPSHOT) };
    const realtime = { hasRoom: jest.fn().mockReturnValue(hasRoom), attach: jest.fn().mockReturnValue(true) };
    const controller = new AuctionPublicController(publicLots as never, realtime as never);
    return { controller, publicLots, realtime };
  };

  it('opens as server-sent events that no proxy buffers', () => {
    const res = new FakeResponse();
    openEventStream(res as unknown as Response);
    expect(res.statusCode).toBe(200);
    expect(res.flushed).toBe(true);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');
    expect(res.headers['x-accel-buffering']).toBe('no');
  });

  it('opens the response, then hands it to the fan-out with the lot’s snapshot', async () => {
    const { controller, realtime } = build(true);
    const res = new FakeResponse();
    await controller.stream('l1', res as unknown as Response);
    expect(res.flushed).toBe(true);
    expect(realtime.attach).toHaveBeenCalledWith('l1', res, SNAPSHOT);
  });

  it('tells a watcher the node is full with a 503 and how long to wait, and opens no stream', async () => {
    const { controller, realtime } = build(false);
    const res = new FakeResponse();
    await controller.stream('l1', res as unknown as Response);
    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBe(String(CLIENT_RETRY_MS / 1_000));
    expect(res.flushed).toBe(false);
    expect(res.body).toMatchObject({ statusCode: 503 });
    expect(realtime.attach).not.toHaveBeenCalled();
  });
});

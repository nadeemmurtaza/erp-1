import { EventEmitter } from 'node:events';
import {
  AuctionRealtimeService,
  CLIENT_RETRY_MS,
  FLUSH_INTERVAL_MS,
  HEARTBEAT_MS,
  type LiveStreamTarget,
  MAX_BUFFERED_BYTES,
  MAX_STREAMS_PER_NODE,
  MAX_STREAM_AGE_MS,
} from './auction-realtime.service';
import type { LotLiveEvent } from './lot-live';

/**
 * launchpad-apps/234-auction-app.md WO-234.4. The fan-out is proved against
 * fake sockets and a fake Redis, with the clock under the test's control: what
 * is written to whom and when, what is merged, what is dropped for a slow
 * watcher, and that publishing can never fail the caller. That a message really
 * crosses between two nodes through Redis, and that a real HTTP stream carries
 * it, are `test/auction-realtime.e2e-spec.ts`'s.
 */
class FakeResponse extends EventEmitter {
  chunks: string[] = [];
  destroyed = false;
  writableEnded = false;
  /** What the socket reports as already queued and unsent. */
  writableLength = 0;

  write(chunk: string) {
    this.chunks.push(chunk);
    return true;
  }
  end() {
    this.writableEnded = true;
    this.emit('close');
  }
  /** The peer hung up. */
  hangUp() {
    this.destroyed = true;
    this.emit('close');
  }
  /** Every `data:` payload written, parsed. */
  events(): LotLiveEvent[] {
    return this.chunks.filter((chunk) => chunk.startsWith('event: lot')).map((chunk) => JSON.parse(chunk.split('data: ')[1]!.trim()) as LotLiveEvent);
  }
}

const event = (bidSeq: number, over: Partial<LotLiveEvent> = {}): LotLiveEvent => ({
  lotId: 'l1',
  state: 'OPEN',
  bidSeq,
  currentBidMinor: 100_000 + bidSeq * 5_000,
  minimumNextBidMinor: 105_000 + bidSeq * 5_000,
  endsAt: '2026-10-10T12:30:00.000Z',
  serverTime: '2026-10-10T12:00:00.000Z',
  newBids: [{ seq: bidSeq, alias: `Bidder ${bidSeq}`, amountMinor: 100_000 + bidSeq * 5_000, kind: 'MANUAL', acceptedAt: '2026-10-10T12:00:00.000Z' }],
  ...over,
});

describe('AuctionRealtimeService', () => {
  let service: AuctionRealtimeService;
  let subscriber: EventEmitter & { psubscribe: jest.Mock; connect: jest.Mock };
  let publisher: { publish: jest.Mock };
  let redisReady: boolean;

  const open = (lotId = 'l1', snapshot: LotLiveEvent = event(0, { newBids: [] })) => {
    const res = new FakeResponse();
    const accepted = service.attach(lotId, res as unknown as LiveStreamTarget, snapshot);
    return { res, accepted };
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    redisReady = true;
    subscriber = Object.assign(new EventEmitter(), {
      psubscribe: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockResolvedValue(undefined),
    });
    publisher = { publish: jest.fn().mockResolvedValue(1) };
    const redis = {
      subscriber: () => subscriber,
      client: () => publisher,
      isReady: () => redisReady,
    };
    service = new AuctionRealtimeService(redis as any);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onApplicationShutdown();
    jest.useRealTimers();
  });

  describe('a stream', () => {
    it('says how long to wait before reconnecting, and writes nothing else before the snapshot', () => {
      const { res, accepted } = open();
      expect(accepted).toBe(true);
      expect(res.chunks[0]).toBe(`retry: ${CLIENT_RETRY_MS}\n\n`);
    });

    it('sends the lot’s snapshot first, so a page that read it a moment earlier misses nothing in between', () => {
      const { res } = open('l1', event(4));
      expect(res.events()).toHaveLength(1);
      expect(res.events()[0]).toMatchObject({ lotId: 'l1', bidSeq: 4 });
      // `id` is the lot's version, so a reconnecting browser says where it was.
      expect(res.chunks[1]).toContain('id: 4\n');
    });

    it('forgets a stream when the peer hangs up, and counts it', () => {
      const a = open();
      open();
      expect(service.openStreams).toBe(2);
      a.res.hangUp();
      expect(service.openStreams).toBe(1);
      a.res.hangUp();
      expect(service.openStreams).toBe(1);
    });

    it('refuses a new stream, writing nothing, when the node already holds its limit', () => {
      for (let index = 0; index < MAX_STREAMS_PER_NODE; index += 1) {
        const res = new FakeResponse();
        expect(service.attach('l1', res as unknown as LiveStreamTarget, event(0, { newBids: [] }))).toBe(true);
      }
      const { res, accepted } = open();
      expect(accepted).toBe(false);
      expect(res.chunks).toHaveLength(0);
      expect(service.hasRoom()).toBe(false);
      expect(service.openStreams).toBe(MAX_STREAMS_PER_NODE);
    });

    it('sends a heartbeat comment to keep an idle connection from being closed by a proxy', () => {
      const { res } = open();
      jest.advanceTimersByTime(HEARTBEAT_MS);
      expect(res.chunks).toContain(': keep-alive\n\n');
    });

    it('ends a stream after its maximum age, which the browser answers by reconnecting', () => {
      const { res } = open();
      jest.advanceTimersByTime(MAX_STREAM_AGE_MS);
      expect(res.writableEnded).toBe(true);
      expect(service.openStreams).toBe(0);
    });
  });

  describe('publishing', () => {
    it('tells this node’s watchers of the lot at once, and no other lot’s', () => {
      const here = open('l1');
      const elsewhere = open('l2');
      service.publish(event(1));
      expect(here.res.events().map((e) => e.bidSeq)).toEqual([0, 1]);
      expect(elsewhere.res.events().map((e) => e.bidSeq)).toEqual([0]);
    });

    it('sends the first event after quiet straight away and merges what arrives inside the next 250 ms into one', () => {
      const { res } = open();
      service.publish(event(1));
      service.publish(event(2));
      service.publish(event(3));
      expect(res.events().map((e) => e.bidSeq)).toEqual([0, 1]);

      jest.advanceTimersByTime(FLUSH_INTERVAL_MS);
      const last = res.events().at(-1)!;
      expect(res.events().map((e) => e.bidSeq)).toEqual([0, 1, 3]);
      // Nothing is lost by merging: the snapshot is the latest, and every bid in the gap rides along.
      expect(last).toMatchObject({ bidSeq: 3, currentBidMinor: 115_000 });
      expect(last.newBids.map((bid) => bid.seq)).toEqual([2, 3]);
    });

    it('writes nothing in a quiet gap, and is ready to send at once again after it', () => {
      const { res } = open();
      service.publish(event(1));
      jest.advanceTimersByTime(FLUSH_INTERVAL_MS * 4);
      expect(res.events()).toHaveLength(2);
      service.publish(event(2));
      expect(res.events().map((e) => e.bidSeq)).toEqual([0, 1, 2]);
    });

    it('caps a hot lot at four writes a second to each watcher, however many bids arrive', () => {
      const { res } = open();
      for (let second = 0; second < 2; second += 1) {
        for (let index = 0; index < 50; index += 1) {
          service.publish(event(second * 50 + index + 1));
          jest.advanceTimersByTime(20);
        }
      }
      // 100 bids over two seconds; the snapshot and at most 4 writes a second.
      expect(res.events().length - 1).toBeLessThanOrEqual(2 * (1_000 / FLUSH_INTERVAL_MS) + 1);
      expect(res.events().at(-1)!.bidSeq).toBeGreaterThanOrEqual(99);
    });

    it('skips a watcher whose socket is still holding too much unsent, and keeps writing to the others', () => {
      const slow = open();
      const fast = open();
      slow.res.writableLength = MAX_BUFFERED_BYTES + 1;
      service.publish(event(1));
      expect(slow.res.events().map((e) => e.bidSeq)).toEqual([0]);
      expect(fast.res.events().map((e) => e.bidSeq)).toEqual([0, 1]);

      // It catches up with the next event once it has drained: nothing it missed matters, an event is a snapshot.
      slow.res.writableLength = 0;
      jest.advanceTimersByTime(FLUSH_INTERVAL_MS);
      service.publish(event(2));
      expect(slow.res.events().at(-1)).toMatchObject({ bidSeq: 2 });
    });

    it('drops a watcher whose response has already been destroyed instead of throwing', () => {
      const dead = open();
      dead.res.destroyed = true;
      expect(() => service.publish(event(1))).not.toThrow();
      expect(service.openStreams).toBe(0);
    });

    it('puts the event on the lot’s Redis channel for other nodes', () => {
      service.publish(event(1));
      expect(publisher.publish).toHaveBeenCalledTimes(1);
      const [channel, payload] = publisher.publish.mock.calls[0];
      expect(channel).toBe('auction:lot:l1');
      expect(JSON.parse(payload)).toMatchObject({ event: { lotId: 'l1', bidSeq: 1 } });
      expect(JSON.parse(payload).node).toEqual(expect.any(String));
    });

    it('never throws and never waits: a Redis that is down or that rejects costs other nodes freshness only', async () => {
      redisReady = false;
      const { res } = open();
      expect(() => service.publish(event(1))).not.toThrow();
      expect(publisher.publish).not.toHaveBeenCalled();
      expect(res.events().map((e) => e.bidSeq)).toEqual([0, 1]);

      redisReady = true;
      publisher.publish.mockRejectedValue(new Error('READONLY You can\'t write against a read only replica'));
      expect(() => service.publish(event(2))).not.toThrow();
      await Promise.resolve();
    });

    it('tells listeners of every event, and a listener that throws does not stop the watchers being told', () => {
      const seen: number[] = [];
      service.onEvent((e) => seen.push(e.bidSeq));
      service.onEvent(() => {
        throw new Error('listener bug');
      });
      const { res } = open();
      service.publish(event(1));
      expect(seen).toEqual([1]);
      expect(res.events().map((e) => e.bidSeq)).toEqual([0, 1]);
    });

    it('stops telling a listener that has unsubscribed', () => {
      const seen: number[] = [];
      const off = service.onEvent((e) => seen.push(e.bidSeq));
      off();
      service.publish(event(1));
      expect(seen).toEqual([]);
    });
  });

  describe('another node’s events, off Redis', () => {
    const fromRedis = (payload: unknown) => subscriber.emit('pmessage', 'auction:lot:*', 'auction:lot:l1', typeof payload === 'string' ? payload : JSON.stringify(payload));

    it('subscribes to every lot’s channel each time the connection is ready, and opens it', () => {
      expect(subscriber.connect).toHaveBeenCalledTimes(1);
      subscriber.emit('ready');
      subscriber.emit('ready');
      expect(subscriber.psubscribe).toHaveBeenCalledTimes(2);
      expect(subscriber.psubscribe).toHaveBeenCalledWith('auction:lot:*');
    });

    it('delivers another node’s event to this node’s watchers and listeners', () => {
      const seen: number[] = [];
      service.onEvent((e) => seen.push(e.bidSeq));
      const { res } = open();
      fromRedis({ node: 'some-other-node', event: event(5) });
      expect(res.events().map((e) => e.bidSeq)).toEqual([0, 5]);
      expect(seen).toEqual([5]);
    });

    it('ignores its own events coming back, since it already delivered them', () => {
      service.publish(event(1));
      const own = JSON.parse(publisher.publish.mock.calls[0][1]);
      const { res } = open();
      fromRedis(own);
      expect(res.events().map((e) => e.bidSeq)).toEqual([0]);
    });

    it('survives a message that is not JSON or carries no event', () => {
      const { res } = open();
      expect(() => fromRedis('not json')).not.toThrow();
      expect(() => fromRedis({ node: 'x' })).not.toThrow();
      expect(res.events()).toHaveLength(1);
    });

    it('does not put a lot back when another node’s older event arrives after a newer local one', () => {
      const { res } = open();
      service.publish(event(7));
      jest.advanceTimersByTime(0);
      fromRedis({ node: 'other', event: event(6) });
      jest.advanceTimersByTime(FLUSH_INTERVAL_MS);
      expect(res.events().at(-1)!.bidSeq).toBe(7);
    });
  });
});

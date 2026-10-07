import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { RedisService } from '../../../core/redis/redis.service';
import { mergeLiveEvents, type LotLiveEvent } from './lot-live';

const CHANNEL_PREFIX = 'auction:lot:';
const CHANNEL_PATTERN = `${CHANNEL_PREFIX}*`;

/**
 * The shortest gap between two writes to a lot's watchers on one node, in
 * milliseconds. The first event after quiet goes out at once; events inside the
 * gap are merged (`mergeLiveEvents`) and go out together when it ends. At the
 * 50 bids a second a hot lot is built for (doc 234 §6) that is at most four
 * writes a second to each watcher instead of fifty, and a person cannot read
 * faster than that: 250 ms is a quarter of the 1 s a screen takes to be read.
 * Nothing is lost by merging, because an event is a snapshot.
 */
export const FLUSH_INTERVAL_MS = 250;

/**
 * Open streams one node will hold. Each is a socket and a few hundred bytes of
 * state; 5 000 is well inside a default Node process's descriptor limit and its
 * memory, and past it a new watcher is told to poll (a 503 with `Retry-After`)
 * rather than the node degrading for the watchers it has. A deployment that
 * needs more runs more nodes: the fan-out is per node by design.
 */
export const MAX_STREAMS_PER_NODE = 5_000;

/**
 * A comment line sent this often keeps a quiet stream from being closed by an
 * idle-connection timeout on a proxy (typically 60 s), and tells the browser
 * the server is alive. 15 s is a quarter of that.
 */
export const HEARTBEAT_MS = 15_000;

/**
 * A stream is ended after this long and the browser reconnects by itself (the
 * `retry` below). It bounds how long a half-dead connection, or one to a node
 * that is being replaced, can linger, and re-sends the current snapshot on every
 * reconnect. Ten minutes is long enough that it is not churn and short enough
 * that nothing stale outlives a deploy by much.
 */
export const MAX_STREAM_AGE_MS = 600_000;

/** How long a browser waits before reconnecting a dropped stream, in milliseconds, sent as SSE `retry`. */
export const CLIENT_RETRY_MS = 5_000;

/**
 * A watcher whose socket already holds more than this unsent is not written to
 * until it drains: its updates are dropped, which is safe because every event
 * is a snapshot and the page notices a missed `bidSeq` and re-reads the lot.
 * 64 KiB is about thirty full events, far more than a healthy connection ever
 * has queued; past it the peer is on a slow or stalled link, and Node would
 * otherwise hold every further write in this process's memory. This is how "a
 * slow consumer never slows the writer" is kept: the writer never waits on
 * anything here at all.
 */
export const MAX_BUFFERED_BYTES = 64 * 1024;

/**
 * What the fan-out needs of one watcher's connection: a writable stream, nothing
 * about HTTP. The controller (the transport adapter) sets the response's status
 * and headers and hands it over; the service only writes frames to it, so it is
 * callable from anywhere and testable without a server.
 */
export interface LiveStreamTarget {
  readonly destroyed: boolean;
  readonly writableEnded: boolean;
  /** Bytes accepted but not yet sent to the peer. */
  readonly writableLength: number;
  write(chunk: string): unknown;
  end(): unknown;
  on(event: 'close' | 'error', listener: () => void): unknown;
}

interface Stream {
  res: LiveStreamTarget;
  heartbeat: NodeJS.Timeout;
  expiry: NodeJS.Timeout;
}

interface LotWatchers {
  streams: Set<Stream>;
  /**
   * The newest state this node has seen for the lot, with no bids. A message
   * that arrives late (another node's older bid, after this node's newer one)
   * is sent with this state and only its own bids, so a page is never put
   * back to an earlier price by it.
   */
  latest: LotLiveEvent | null;
  /** An event waiting for the gap after the last write to end. */
  pending: LotLiveEvent | null;
  /** Set while inside the gap after a write. */
  cooling: NodeJS.Timeout | null;
}

type Listener = (event: LotLiveEvent) => void;

/**
 * Live fan-out of one lot's changes to everyone watching it (launchpad-apps/
 * 234-auction-app.md §6, WO-234.4).
 *
 * A bid is committed first; only then does `publish()` run, and it never
 * waits, never throws and never touches the transaction: the price is a fact in
 * Postgres whether or not anyone hears about it. It delivers to this node's
 * watchers directly and to every other node through a Redis channel
 * (`auction:lot:<id>`), so one node's bid reaches a watcher connected to
 * another. Each node holds one subscriber connection to the pattern, keeps only
 * the lots someone on it is watching, and drops the rest on arrival.
 *
 * Failure modes. Redis down: this node's own bids still reach this node's
 * watchers, other nodes' pages fall back to polling every 5 s, nothing is
 * queued for later. A watcher too slow: its writes are skipped (see
 * `MAX_BUFFERED_BYTES`). A node restarting: its streams drop, the browser
 * reconnects to another node and is sent the current snapshot first. Nothing
 * here can cost a bid.
 */
@Injectable()
export class AuctionRealtimeService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AuctionRealtimeService.name);
  /** Tells this node's own messages from other nodes' when they come back off Redis. */
  private readonly nodeId = randomUUID();
  private readonly lots = new Map<string, LotWatchers>();
  private readonly listeners = new Set<Listener>();
  private streamCount = 0;
  private lastPublishWarning = 0;

  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    const subscriber = this.redis.subscriber('realtime');
    subscriber.on('pmessage', (_pattern: string, _channel: string, message: string) => this.receive(message));
    // Subscribe on every `ready`, not once: the first connection may be refused
    // (Redis starting after the API) and a later reconnect starts afresh.
    subscriber.on('ready', () => {
      subscriber.psubscribe(CHANNEL_PATTERN).catch((error: Error) => {
        this.logger.warn(`Could not subscribe to live auction updates: ${error.message}`);
      });
    });
    subscriber.connect().catch(() => undefined); // an unreachable Redis is reported by RedisService and retried by its strategy
  }

  async onApplicationShutdown(): Promise<void> {
    for (const watchers of this.lots.values()) {
      if (watchers.cooling) clearTimeout(watchers.cooling);
      for (const stream of [...watchers.streams]) this.close(watchers, stream, stream.res);
    }
    this.lots.clear();
  }

  /** Streams open on this node, for the health picture and the tests. */
  get openStreams(): number {
    return this.streamCount;
  }

  /**
   * Called for every event this node learns of, from its own writers or from
   * Redis, so a cache of the lot can be dropped (`AuctionPublicService`). A
   * listener that throws is logged and does not stop the fan-out.
   */
  onEvent(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Announces a committed change to a lot. Synchronous for this node's
   * watchers, fire-and-forget to Redis, and never throws: a failure to tell
   * anyone is logged once a minute and costs only freshness.
   */
  publish(event: LotLiveEvent): void {
    this.deliver(event);
    if (!this.redis.isReady('realtime')) {
      this.warnOnce('Redis is not connected; other nodes’ pages will pick this change up on their next poll');
      return;
    }
    this.redis
      .client('realtime')
      .publish(`${CHANNEL_PREFIX}${event.lotId}`, JSON.stringify({ node: this.nodeId, event }))
      .catch((error: Error) => this.warnOnce(`Could not publish a lot update: ${error.message}`));
  }

  /** Whether this node can hold another stream; the caller refuses a watcher with a 503 when it cannot. */
  hasRoom(): boolean {
    return this.streamCount < MAX_STREAMS_PER_NODE;
  }

  /**
   * Starts a server-sent-events stream for one lot on `res`, whose status and
   * headers the caller has already sent (`openEventStream`). `snapshot` goes
   * first, so a page that read the lot a moment earlier misses nothing in
   * between. Returns false, writing nothing, when the node is full.
   */
  attach(lotId: string, res: LiveStreamTarget, snapshot: LotLiveEvent): boolean {
    if (!this.hasRoom()) return false;

    res.write(`retry: ${CLIENT_RETRY_MS}\n\n`);

    let watchers = this.lots.get(lotId);
    if (!watchers) {
      watchers = { streams: new Set(), latest: null, pending: null, cooling: null };
      this.lots.set(lotId, watchers);
    }
    const group = watchers;
    const stream: Stream = {
      res,
      heartbeat: setInterval(() => this.write(group, stream, ': keep-alive\n\n'), HEARTBEAT_MS),
      expiry: setTimeout(() => this.close(group, stream, res), MAX_STREAM_AGE_MS),
    };
    stream.heartbeat.unref();
    stream.expiry.unref();
    group.streams.add(stream);
    this.streamCount += 1;

    const gone = () => this.close(group, stream, null);
    res.on('close', gone);
    res.on('error', gone);

    // What the node has seen since the snapshot was read wins over it.
    this.write(group, stream, frame(group.latest ? mergeLiveEvents(snapshot, group.latest) : snapshot));
    group.latest = group.latest ? mergeLiveEvents(snapshot, group.latest) : snapshot;
    group.latest = { ...group.latest, newBids: [] };
    return true;
  }

  /** A message off Redis: ignore this node's own, deliver the rest. */
  private receive(message: string): void {
    let parsed: { node?: string; event?: LotLiveEvent };
    try {
      parsed = JSON.parse(message) as typeof parsed;
    } catch {
      this.logger.warn('Dropped a live auction update that was not JSON');
      return;
    }
    if (!parsed.event || parsed.node === this.nodeId) return;
    this.deliver(parsed.event);
  }

  /** Tells this node's listeners and watchers of one event. */
  private deliver(event: LotLiveEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.warn(`A live-update listener failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const watchers = this.lots.get(event.lotId);
    if (!watchers) return;
    // Against the newest state seen, so an event that arrives late keeps its bids but not its price.
    const current = watchers.latest ? mergeLiveEvents(watchers.latest, event) : event;
    watchers.latest = { ...current, newBids: [] };
    watchers.pending = watchers.pending ? mergeLiveEvents(watchers.pending, current) : current;
    if (!watchers.cooling) this.flush(event.lotId, watchers);
  }

  /** Writes the pending event to every watcher, then holds further writes for `FLUSH_INTERVAL_MS`. */
  private flush(lotId: string, watchers: LotWatchers): void {
    const event = watchers.pending;
    watchers.pending = null;
    if (!event) return;

    const data = frame(event);
    for (const stream of [...watchers.streams]) this.write(watchers, stream, data);

    watchers.cooling = setTimeout(() => {
      watchers.cooling = null;
      if (watchers.pending) this.flush(lotId, watchers);
      else if (watchers.streams.size === 0) this.lots.delete(lotId);
    }, FLUSH_INTERVAL_MS);
    watchers.cooling.unref();
  }

  private write(watchers: LotWatchers, stream: Stream, data: string): void {
    const { res } = stream;
    if (res.destroyed || res.writableEnded) {
      this.close(watchers, stream, null);
      return;
    }
    // A watcher that has not drained what it was already sent is skipped, not
    // waited for: see MAX_BUFFERED_BYTES.
    if (res.writableLength > MAX_BUFFERED_BYTES) return;
    try {
      res.write(data);
    } catch (error) {
      this.logger.debug(`Write to a live stream failed: ${error instanceof Error ? error.message : String(error)}`);
      this.close(watchers, stream, null);
    }
  }

  /** Forgets one stream; ends its response when `res` is given (the peer is not already gone). */
  private close(watchers: LotWatchers, stream: Stream, res: LiveStreamTarget | null): void {
    if (!watchers.streams.delete(stream)) return;
    clearInterval(stream.heartbeat);
    clearTimeout(stream.expiry);
    this.streamCount -= 1;
    if (res && !res.writableEnded) res.end();
    if (watchers.streams.size === 0 && !watchers.cooling) {
      for (const [lotId, held] of this.lots) if (held === watchers) this.lots.delete(lotId);
    }
  }

  private warnOnce(message: string): void {
    const now = Date.now();
    if (now - this.lastPublishWarning < 60_000) return;
    this.lastPublishWarning = now;
    this.logger.warn(message);
  }
}

/** One server-sent event: the lot's snapshot, with `id` set to its version so a reconnect can say where it was. */
function frame(event: LotLiveEvent): string {
  return `event: lot\nid: ${event.bidSeq}\ndata: ${JSON.stringify(event)}\n\n`;
}

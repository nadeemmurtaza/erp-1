import type { Logger } from '@nestjs/common';
import type { ChainableCommander } from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { RedisService } from '../redis/redis.service';
import { InProcessCache } from './in-process-cache';

export interface TieredCacheOptions<V> {
  /**
   * What this cache's Redis keys start with, in the shared `cache` keyspace
   * (redis.keyspaces.ts). One per consumer — `permissions`, `settings` —
   * lower-case letters, digits and hyphens only, so no two consumers' keys
   * can ever meet (see `keys` below).
   */
  namespace: string;
  l1: { maxEntries: number; ttlMs: number };
  l2: { ttlMs: number };
  /**
   * Rebuilds a value from the JSON an L2 entry holds, or `undefined` when the
   * stored shape is not one this code reads — say, written by another version
   * mid-deploy. An undecodable entry is a miss, never an error.
   */
  decode: (json: unknown) => V | undefined;
  /** The clock, in epoch ms. Tests pass their own; left out, it is Date.now(). */
  now?: () => number;
}

export interface Loaded<V> {
  value: V;
  /**
   * Epoch ms after which this value is no longer true, when that comes sooner
   * than either tier's TTL — a time-boxed OrgUnitGrant's `expiresAt`, say.
   * Neither tier serves the value past it. Absent or null: only the TTLs bound it.
   */
  validUntil?: number | null;
}

/** The two tokens an L2 entry is valid under: the namespace's generation and its own id's version. */
interface Stamp {
  g: string | null;
  v: string | null;
}

interface StoredEntry extends Stamp {
  /** Epoch ms, by the writer's clock; Redis's own PX removes the key at the same moment. */
  exp: number;
  value: unknown;
}

type SharedRead<V> =
  | { kind: 'hit'; value: V; expiresAt: number }
  /** `readAt`: when the tokens were read — a write-back later than one L2 TTL after it is skipped. */
  | { kind: 'miss'; stamp: Stamp; readAt: number }
  /** Redis not connected, or the read failed: serve from the loader, write nothing back. */
  | { kind: 'off' };

const NAMESPACE = /^[a-z][a-z0-9-]*$/;

/**
 * 208-l1-l2-l3-caching-architecture.md's L1 and L2 as one read path: an
 * InProcessCache per process in front of a Redis entry every replica shares,
 * in front of the loader (Postgres). Both tiers are dropped by explicit
 * invalidation at the write — TTL is the backstop, never the mechanism.
 *
 * Redis keys, all in the `cache` keyspace:
 *   `{ns}:{id}`           the entry: `{ g, v, exp, value }` as JSON, PX = its lifetime
 *   `{ns}.version:{id}`   a random token `invalidate(id)` replaces, PX = 2 × L2 TTL
 *   `{ns}.generation`     a random token `invalidateAll()` replaces, no expiry
 * An entry key has `:` straight after the namespace and a token key has `.`,
 * so no id can make one look like the other.
 *
 * Why tokens and not only DEL: a replica that read Postgres just before a
 * write committed would, with DEL alone, put the old value back just after
 * the writer deleted it — and every replica would then serve it for the whole
 * L2 TTL. Instead every entry records the two tokens it was read under
 * (fetched in the same MGET that looked for the entry, before the database
 * read) and is served only while both still match; a write replaces its
 * token, so a late write-back is born stale and never served. The same
 * generation token lets one write drop every entry at once — a role's grants
 * changing changes every holder's resolved set, and nothing has to find them.
 * A token key lives 2 × the L2 TTL and an entry is never written more than
 * one TTL after its tokens were read, so a token always outlives every entry
 * stamped with its predecessor; none is ever evicted (the instance runs
 * noeviction).
 *
 * L1 has the same race inside one process, closed by `epoch`: a read that was
 * in flight when this process invalidated never fills L1. What stays open, on
 * purpose (doc 208 §2): another replica's L1 keeps what it holds until its
 * own TTL lapses — no cross-replica push exists — and an entry filled from L2
 * lives no longer than that L2 entry has left.
 *
 * Redis failing never fails a read: the loader answers, and nothing is written
 * back. An invalidation that cannot reach Redis is logged as an error, because
 * other replicas may then serve the old value until the entry expires.
 */
export class TieredCache<V extends NonNullable<unknown>> {
  private readonly l1: InProcessCache<string, V>;
  private readonly now: () => number;
  /** Bumped by every invalidation in this process; a read begun under an older value never fills L1. */
  private epoch = 0;
  /** Set while L2 reads/writes are failing, so an outage is logged once, not per request. */
  private degradedSince: number | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly logger: Logger,
    private readonly options: TieredCacheOptions<V>,
  ) {
    if (!NAMESPACE.test(options.namespace)) {
      throw new RangeError(`TieredCache namespace must match ${NAMESPACE}, got "${options.namespace}"`);
    }
    if (!Number.isSafeInteger(options.l2.ttlMs) || options.l2.ttlMs <= 0) {
      throw new RangeError(`TieredCache l2.ttlMs must be a positive integer of milliseconds, got ${options.l2.ttlMs}`);
    }
    this.now = options.now ?? (() => Date.now());
    this.l1 = new InProcessCache<string, V>({ ...options.l1, now: this.now });
  }

  async getOrLoad(id: string, load: () => Promise<Loaded<V>>): Promise<V> {
    const cached = this.l1.get(id);
    if (cached !== undefined) return cached;

    const epoch = this.epoch;
    const shared = await this.readShared(id);
    if (shared.kind === 'hit') {
      this.fillL1(epoch, id, shared.value, shared.expiresAt);
      return shared.value;
    }

    const loaded = await load();
    const validUntil = loaded.validUntil ?? Number.POSITIVE_INFINITY;
    this.fillL1(epoch, id, loaded.value, validUntil);
    if (shared.kind === 'miss') await this.writeShared(id, loaded.value, shared, validUntil);
    return loaded.value;
  }

  /** After a write that changed `id` has committed: gone from this process at once, and from L2 for every replica. */
  async invalidate(id: string): Promise<void> {
    this.epoch += 1;
    this.l1.invalidate(id);
    await this.dropShared(`"${id}"`, (pipeline) =>
      pipeline
        .set(this.versionKey(id), randomUUID(), 'PX', this.options.l2.ttlMs * 2)
        .del(this.entryKey(id)),
    );
  }

  /** After a write that changed every id's value at once has committed. O(1) in Redis — no entry is looked up. */
  async invalidateAll(): Promise<void> {
    this.epoch += 1;
    this.l1.invalidate();
    await this.dropShared('every entry', (pipeline) => pipeline.set(this.generationKey(), randomUUID()));
  }

  private fillL1(epoch: number, id: string, value: V, validUntil: number): void {
    if (epoch !== this.epoch) return;
    this.l1.set(id, value, validUntil - this.now());
  }

  private async readShared(id: string): Promise<SharedRead<V>> {
    if (!this.redis.isReady('cache')) return { kind: 'off' };
    const readAt = this.now();
    try {
      const [generation, version, raw] = await this.redis
        .client('cache')
        .mget(this.generationKey(), this.versionKey(id), this.entryKey(id));
      this.recovered();

      const stamp: Stamp = { g: generation ?? null, v: version ?? null };
      const entry = raw == null ? undefined : parseEntry(raw);
      if (entry && entry.g === stamp.g && entry.v === stamp.v && entry.exp > this.now()) {
        const value = this.options.decode(entry.value);
        if (value !== undefined) return { kind: 'hit', value, expiresAt: entry.exp };
      }
      return { kind: 'miss', stamp, readAt };
    } catch (error) {
      this.degraded('read', error);
      return { kind: 'off' };
    }
  }

  private async writeShared(
    id: string,
    value: V,
    { stamp, readAt }: { stamp: Stamp; readAt: number },
    validUntil: number,
  ): Promise<void> {
    const now = this.now();
    const ttlMs = Math.floor(Math.min(this.options.l2.ttlMs, validUntil - now));
    if (ttlMs <= 0 || now - readAt >= this.options.l2.ttlMs || !this.redis.isReady('cache')) return;
    try {
      const entry: StoredEntry = { g: stamp.g, v: stamp.v, exp: now + ttlMs, value };
      await this.redis.client('cache').set(this.entryKey(id), JSON.stringify(entry), 'PX', ttlMs);
      this.recovered();
    } catch (error) {
      // A full instance refuses the write (noeviction): a miss next time, nothing worse.
      this.degraded('write', error);
    }
  }

  private async dropShared(what: string, queue: (pipeline: ChainableCommander) => ChainableCommander): Promise<void> {
    const consequence =
      `other replicas may serve the previous "${this.options.namespace}" value for ${what} until it expires ` +
      `(at most ${this.options.l2.ttlMs / 1000} s)`;
    if (!this.redis.isReady('cache')) {
      this.logger.error(`Could not invalidate ${what} in the shared cache: Redis is not connected — ${consequence}.`);
      return;
    }
    try {
      // A pipeline, not MULTI: under noeviction a full instance refuses the
      // SET, and MULTI would then abort the DEL with it; DEL is always allowed.
      const results = (await queue(this.redis.client('cache').pipeline()).exec()) ?? [];
      const failure = results.find(([error]) => error);
      if (failure) throw failure[0];
      this.recovered();
    } catch (error) {
      this.logger.error(`Could not invalidate ${what} in the shared cache: ${describe(error)} — ${consequence}.`);
    }
  }

  private degraded(operation: 'read' | 'write', error: unknown): void {
    if (this.degradedSince !== null) return;
    this.degradedSince = this.now();
    this.logger.warn(
      `Shared "${this.options.namespace}" cache ${operation} failed (${describe(error)}); serving from the database ` +
        'and this process alone until Redis answers again.',
    );
  }

  private recovered(): void {
    if (this.degradedSince === null) return;
    const seconds = Math.round((this.now() - this.degradedSince) / 1000);
    this.degradedSince = null;
    this.logger.log(`Shared "${this.options.namespace}" cache answering again after ${seconds} s.`);
  }

  private entryKey(id: string): string {
    return `${this.options.namespace}:${id}`;
  }

  private versionKey(id: string): string {
    return `${this.options.namespace}.version:${id}`;
  }

  private generationKey(): string {
    return `${this.options.namespace}.generation`;
  }
}

function parseEntry(raw: string): StoredEntry | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const { g, v, exp, value } = parsed as Record<string, unknown>;
  if (!isToken(g) || !isToken(v) || typeof exp !== 'number') return undefined;
  return { g, v, exp, value };
}

function isToken(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

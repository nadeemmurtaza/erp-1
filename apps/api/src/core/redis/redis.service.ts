import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { Redis, type RedisOptions } from 'ioredis';
import { AppConfigService } from '../config/app-config.service';
import { REDIS_KEYSPACES, type RedisKeyspace } from './redis.keyspaces';

/**
 * How every connection to the dedicated Redis instance behaves when Redis is
 * slow or gone (206-rate-limiting-caching-compression-hardening.md, ADR-075's
 * 2026-09-28 addendum). Each value is chosen so a caller learns about an
 * outage immediately and decides for itself what to do — fail closed on a
 * credential route, fall back on the global limit — rather than having its
 * request parked inside the client.
 */
export const REDIS_CLIENT_OPTIONS = {
  /**
   * A command sent while disconnected is rejected at once instead of queued
   * until the connection returns. Queued commands are how a Redis outage
   * turns into a pile-up of requests all waiting on the same dead socket.
   */
  enableOfflineQueue: false,
  /**
   * A command in flight when the connection drops is failed on the first
   * drop, never retried after the reconnect...
   */
  maxRetriesPerRequest: 0,
  /**
   * ...and never resent either: a replayed `EVAL` would spend a second login
   * token, a replayed `INCR` would count one request twice.
   */
  autoResendUnfulfilledCommands: false,
  /**
   * 500 ms. A same-network round trip is well under 1 ms, and Linux's minimum
   * TCP retransmit timeout is 200 ms, so one lost packet still fits; a Redis
   * that is up but not answering (a partition with no RST, a blocking
   * command) costs a request at most half a second before it degrades,
   * instead of the kernel's multi-minute TCP timeout.
   */
  commandTimeout: 500,
  /**
   * 2 s per connection attempt (ioredis's own default is 10 s). A container on
   * the same network connects in ~1 ms; 2 s still covers a cold DNS lookup,
   * and bounds how long a black-holed address holds up each reconnect.
   */
  connectTimeout: 2_000,
} as const satisfies RedisOptions;

/**
 * Reconnect forever, 50 ms more per attempt, capped at 2 s — ioredis's own
 * default, restated so the recovery bound is visible where it is relied on:
 * once Redis is back, this API notices within 2 s.
 */
export function redisReconnectDelayMs(attempt: number): number {
  return Math.min(attempt * 50, 2_000);
}

/**
 * How long boot waits for the first connection before carrying on without
 * it: long enough for a healthy instance (milliseconds) so the first sign-ins
 * after a deploy do not fail on a connection still being opened, short enough
 * that an unreachable Redis delays startup by 2 s, not indefinitely. Redis is
 * never a boot dependency (38-resilience-engineering.md §1: every *total*
 * outage in the degradation matrix is Postgres itself).
 */
export const REDIS_BOOT_READY_WAIT_MS = 2_000;

export interface RedisPing {
  ok: boolean;
  detail?: string;
}

/**
 * The one owner of this API's Redis connections — one per keyspace
 * (redis.keyspaces.ts), all to the instance `REDIS_URL` names.
 *
 * It owns connection lifecycle and failure reporting, nothing else: callers
 * take `client(keyspace)` and issue their own commands, and each caller
 * decides what an unreachable Redis means for it. Connecting never blocks
 * boot beyond REDIS_BOOT_READY_WAIT_MS, and an outage is logged once when it
 * starts and once when it ends — not once per failed command.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly clients = new Map<RedisKeyspace, Redis>();
  /** Keyspace → when its current outage started (epoch ms). Absent while connected. */
  private readonly outageStartedAt = new Map<RedisKeyspace, number>();

  constructor(private readonly config: AppConfigService) {}

  /**
   * The connection for one keyspace. Created on first use without touching
   * the network (a factory such as ThrottlerModule's may ask before
   * onModuleInit has run); onModuleInit is what opens it.
   */
  client(keyspace: RedisKeyspace): Redis {
    const existing = this.clients.get(keyspace);
    if (existing) return existing;

    const created = new Redis(this.config.get('REDIS_URL'), {
      ...REDIS_CLIENT_OPTIONS,
      db: REDIS_KEYSPACES[keyspace].db,
      lazyConnect: true,
      retryStrategy: redisReconnectDelayMs,
      connectionName: `api:${keyspace}`,
    });
    this.watch(keyspace, created);
    this.clients.set(keyspace, created);
    return created;
  }

  /** True only while the keyspace's connection can take a command right now. */
  isReady(keyspace: RedisKeyspace): boolean {
    return this.client(keyspace).status === 'ready';
  }

  /** A round trip, for the readiness probe. Never throws. */
  async ping(keyspace: RedisKeyspace): Promise<RedisPing> {
    try {
      await this.client(keyspace).ping();
      return { ok: true };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  async onModuleInit(): Promise<void> {
    const keyspaces = Object.keys(REDIS_KEYSPACES) as RedisKeyspace[];
    await Promise.all(keyspaces.map((keyspace) => this.open(keyspace)));
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [...this.clients.values()].map(async (client) => {
        if (client.status !== 'ready') {
          client.disconnect();
          return;
        }
        try {
          await client.quit();
        } catch {
          client.disconnect();
        }
      }),
    );
  }

  private async open(keyspace: RedisKeyspace): Promise<void> {
    const client = this.client(keyspace);
    if (client.status === 'wait') {
      // A failed first attempt is reported by the 'error' listener, and
      // retried by retryStrategy like any later drop.
      client.connect().catch(() => undefined);
    }
    if (!(await waitUntilReady(client, REDIS_BOOT_READY_WAIT_MS))) {
      this.logger.warn(
        `Redis keyspace "${keyspace}" not ready after ${REDIS_BOOT_READY_WAIT_MS} ms at ${this.address(client)} — ` +
          `starting without it. ${REDIS_KEYSPACES[keyspace].whenDown}`,
      );
    }
  }

  private watch(keyspace: RedisKeyspace, client: Redis): void {
    client.on('ready', () => {
      const since = this.outageStartedAt.get(keyspace);
      this.outageStartedAt.delete(keyspace);
      if (since === undefined) {
        this.logger.log(`Redis keyspace "${keyspace}" connected (${this.address(client)}, db ${REDIS_KEYSPACES[keyspace].db})`);
      } else {
        this.logger.log(`Redis keyspace "${keyspace}" reconnected after ${Math.round((Date.now() - since) / 1000)} s`);
      }
    });

    client.on('error', (error: Error) => {
      if (this.outageStartedAt.has(keyspace)) return;
      this.outageStartedAt.set(keyspace, Date.now());
      // The address only — REDIS_URL may carry a password.
      this.logger.error(`Redis keyspace "${keyspace}" unreachable at ${this.address(client)}: ${error.message}`);
    });
  }

  private address(client: Redis): string {
    return `${client.options.host ?? 'localhost'}:${client.options.port ?? 6379}`;
  }
}

function waitUntilReady(client: Redis, timeoutMs: number): Promise<boolean> {
  if (client.status === 'ready') return Promise.resolve(true);
  return new Promise((resolve) => {
    const onReady = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      client.off('ready', onReady);
      resolve(false);
    }, timeoutMs);
    timer.unref();
    client.once('ready', onReady);
  });
}

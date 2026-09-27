import { Injectable, Logger } from '@nestjs/common';
import {
  CircuitOpenError,
  DEFAULT_CIRCUIT_OPTIONS,
  type CircuitBreaker,
  type CircuitBreakerOptions,
  type CircuitSnapshot,
  type CircuitState,
  type SimulatedCallOutcome,
  type SimulationResult,
  type SimulationTransition,
} from './circuit-breaker';

interface CircuitRecord {
  state: CircuitState;
  failureCount: number;
  options: CircuitBreakerOptions;
  openedAt: number | null;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
}

/**
 * `CircuitBreaker` implementation (38-resilience-engineering.md §2, WO-38.2).
 *
 * In-memory, per process — the doc's own "hundred-thousandth row" lens: a
 * small, bounded set (one entry per extension-point key), never a database
 * table. That also means a circuit's state does not survive a restart or
 * differ between API instances behind a load balancer; each process learns
 * a dependency is down within its own `failureThreshold` calls, which is
 * the correct, cheap trade for infrastructure whose whole job is "stop
 * calling a dependency that just failed," not a cross-process invariant.
 *
 * Wraps every call site of:
 *  - `AiProvider`, from the one funnel every caller already goes through —
 *    `AiService.complete()`/`.embed()`/`.describeImage()`.
 *  - `PaymentProvider`, from `PaymentsService.createForOrder()`'s own
 *    `provider.initiate()` call.
 *  - `VectorStore`, from `RagRetrievalService.search()` and
 *    `RagIngestionService`'s own `upsertChunks()` call.
 *
 * Deliberately NOT wrapping `OutboundConnector` (doc 36): that interface
 * does not exist in this codebase yet (`grep -rln "OutboundConnector"
 * apps/api/src` returns nothing — doc 36 is a design, not shipped code).
 * `execute()` is generic enough to wrap it the day it ships — a new key,
 * no change here — but there is nothing to wrap today, and building
 * `OutboundConnector` itself is out of this document's scope.
 */
@Injectable()
export class CircuitBreakerService implements CircuitBreaker {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly circuits = new Map<string, CircuitRecord>();

  /**
   * Doc 38's own "Authority and blast radius" scope-lens:
   * `platform.resilience.tune` holders only, checked by the admin
   * controller, not here — this method trusts its caller.
   */
  configure(key: string, options: Partial<CircuitBreakerOptions>): CircuitSnapshot {
    const record = this.recordFor(key);
    record.options = { ...record.options, ...options };
    this.logger.log(
      `circuit "${key}" reconfigured: threshold=${record.options.failureThreshold}, cooldownMs=${record.options.cooldownMs}`,
    );
    return this.snapshot(key, record);
  }

  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const record = this.recordFor(key);

    if (record.state === 'OPEN') {
      const elapsed = Date.now() - (record.openedAt ?? 0);
      const remaining = record.options.cooldownMs - elapsed;
      if (remaining > 0) {
        throw new CircuitOpenError(key, remaining);
      }
      record.state = 'HALF_OPEN';
      this.logger.warn(`circuit "${key}": cooldown elapsed, trial call (HALF_OPEN)`);
    }

    try {
      const result = await fn();
      this.onSuccess(key, record);
      return result;
    } catch (error) {
      this.onFailure(key, record);
      throw error;
    }
  }

  getSnapshot(key: string): CircuitSnapshot {
    return this.snapshot(key, this.recordFor(key));
  }

  /** Every circuit that has ever taken a call or been configured — the admin dashboard's own list. */
  listSnapshots(): CircuitSnapshot[] {
    return [...this.circuits.keys()].sort().map((key) => this.snapshot(key, this.circuits.get(key)!));
  }

  /**
   * Doc 38's own "Dry run before live" scope-lens: replays a candidate
   * threshold/cooldown against a call history the caller supplies, with no
   * side effect — a pure function (no `prisma.` write, no `publish(`), so
   * it can be called speculatively before a real threshold change ships.
   *
   * Today this has no live history to call it with: neither `AiProvider`
   * nor `PaymentProvider` nor `VectorStore` calls are logged anywhere
   * (WO-38.3's own `RequestOutcome` table instruments three different,
   * named business paths — checkout, POS sale, till-parent sync — not
   * these extension-point calls). This method is the ready-the-day-it's-
   * needed half of that gap, honestly unable to answer "would this have
   * tripped last month" until a real call-outcome log for these four
   * extension points exists — named explicitly rather than faked.
   */
  simulate(history: SimulatedCallOutcome[], options: CircuitBreakerOptions): SimulationResult {
    const sorted = [...history].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const transitions: SimulationTransition[] = [];

    let state: CircuitState = 'CLOSED';
    let failureCount = 0;
    let openedAt: number | null = null;

    for (const point of sorted) {
      const at = point.occurredAt.getTime();

      if (state === 'OPEN') {
        if (at - (openedAt ?? 0) < options.cooldownMs) continue; // fails fast, never reaches fn()
        state = 'HALF_OPEN';
      }

      if (point.succeeded) {
        if (state === 'HALF_OPEN') {
          transitions.push({ at: point.occurredAt.toISOString(), action: 'CLOSE' });
        }
        state = 'CLOSED';
        failureCount = 0;
      } else {
        failureCount += 1;
        if (state === 'HALF_OPEN' || failureCount >= options.failureThreshold) {
          state = 'OPEN';
          openedAt = at;
          transitions.push({ at: point.occurredAt.toISOString(), action: 'OPEN' });
        }
      }
    }

    return {
      wouldHaveTripped: transitions.some((t) => t.action === 'OPEN'),
      transitions,
      openWindowCount: transitions.filter((t) => t.action === 'OPEN').length,
    };
  }

  private onSuccess(key: string, record: CircuitRecord): void {
    if (record.state !== 'CLOSED') {
      this.logger.log(`circuit "${key}": trial call succeeded — CLOSED`);
    }
    record.state = 'CLOSED';
    record.failureCount = 0;
    record.openedAt = null;
    record.lastSuccessAt = Date.now();
  }

  private onFailure(key: string, record: CircuitRecord): void {
    record.failureCount += 1;
    record.lastFailureAt = Date.now();

    if (record.state === 'HALF_OPEN') {
      record.state = 'OPEN';
      record.openedAt = Date.now();
      this.logger.warn(`circuit "${key}": trial call failed — re-OPENED`);
      return;
    }

    if (record.state === 'CLOSED' && record.failureCount >= record.options.failureThreshold) {
      record.state = 'OPEN';
      record.openedAt = Date.now();
      this.logger.error(
        `circuit "${key}": ${record.failureCount} consecutive failures — OPENED for ${record.options.cooldownMs}ms`,
      );
    }
  }

  private recordFor(key: string): CircuitRecord {
    let record = this.circuits.get(key);
    if (!record) {
      record = {
        state: 'CLOSED',
        failureCount: 0,
        options: { ...DEFAULT_CIRCUIT_OPTIONS },
        openedAt: null,
        lastFailureAt: null,
        lastSuccessAt: null,
      };
      this.circuits.set(key, record);
    }
    return record;
  }

  private snapshot(key: string, record: CircuitRecord): CircuitSnapshot {
    return {
      key,
      state: record.state,
      failureCount: record.failureCount,
      options: record.options,
      openedAt: record.openedAt ? new Date(record.openedAt).toISOString() : null,
      lastFailureAt: record.lastFailureAt ? new Date(record.lastFailureAt).toISOString() : null,
      lastSuccessAt: record.lastSuccessAt ? new Date(record.lastSuccessAt).toISOString() : null,
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SLO_PATHS, SLO_TARGETS, TRAILING_WINDOW_DAYS, type SloPath } from './slo-paths';

export interface SloBudget {
  path: SloPath;
  label: string;
  windowDays: number;
  totalRequests: number;
  succeededRequests: number;
  /** null when `totalRequests` is 0 — no observed rate yet, not "100%." */
  successRatePct: number | null;
  successTargetPct: number | null;
  /** ms — null when there are too few samples for a stable percentile (see `computeBudget`). */
  p95LatencyMs: number | null;
  latencyTargetMs: number;
  latencyTargetLabel: string;
  /**
   * Minutes of allowed failure remaining in the trailing window, scaled by
   * how much of the allowed failure rate has actually been consumed (doc
   * 38 §3's own worked example: 99.9% over 30 days ~= 43 minutes at zero
   * observed failures). Null when `successTargetPct` is null
   * (`replication.sync` — see `SloTarget.successTargetPct`'s own doc).
   */
  remainingBudgetMinutes: number | null;
  /** True once `remainingBudgetMinutes` goes negative — doc 38 §3's "crossing the budget freezes non-essential deploys to that path." */
  overBudget: boolean;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 38-resilience-engineering.md §3, WO-38.3.
 *
 * `time()` wraps checkout/POS-sale; `recordReplicationTick()` is called by
 * `ReplicationSyncAgent` on every tick. Both write through `recordAsync()`,
 * which never awaits its own Prisma write on the caller's behalf and never
 * lets a write failure escape — recording an outcome must never slow down
 * or fail the path it is observing (doc 38's own implicit "observability
 * is never a new failure mode" rule, the same one `PosSalesService.sell()`
 * already applies to its own best-effort receipt write).
 */
@Injectable()
export class SloRecorderService {
  private readonly logger = new Logger(SloRecorderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async time<T>(path: SloPath, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.recordAsync(path, true, Date.now() - start);
      return result;
    } catch (error) {
      this.recordAsync(path, false, Date.now() - start);
      throw error;
    }
  }

  /**
   * `succeeded` here is "was the oldest still-unsynced fact's age within
   * `boundMs`," not "did this tick's own push attempt throw" — see
   * `SLO_TARGETS['replication.sync']`'s own doc comment on why this path's
   * bound is a latency bound, not a request-success rate.
   */
  recordReplicationTick(backlogAgeMs: number): void {
    const boundMs = SLO_TARGETS[SLO_PATHS.ReplicationSync].latencyTargetMs;
    this.recordAsync(SLO_PATHS.ReplicationSync, backlogAgeMs <= boundMs, backlogAgeMs);
  }

  private recordAsync(path: SloPath, succeeded: boolean, latencyMs: number): void {
    this.prisma.requestOutcome
      .create({ data: { path, succeeded, latencyMs } })
      .catch((error: unknown) => this.logger.warn(`failed to record SLO outcome for ${path}: ${describe(error)}`));
  }

  /**
   * Doc 38's own "Click the number" scope-lens: `totalRequests`/
   * `succeededRequests` are the exact counts the percentage was computed
   * from, so a dashboard reading this can always drill into the same
   * `RequestOutcome` rows rather than trusting a bare percentage.
   */
  async computeBudget(path: SloPath): Promise<SloBudget> {
    const target = SLO_TARGETS[path];
    const since = new Date(Date.now() - TRAILING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [totalRequests, succeededRequests, p95Rows] = await Promise.all([
      this.prisma.requestOutcome.count({ where: { path, occurredAt: { gte: since } } }),
      this.prisma.requestOutcome.count({ where: { path, occurredAt: { gte: since }, succeeded: true } }),
      // A percentile needs the ordered set, cheapest as one indexed range
      // scan in Postgres itself rather than pulling every row into Node —
      // the "hundred-thousandth row" lens this table is built against.
      this.prisma.$queryRaw<Array<{ p95: number | null }>>`
        SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95
        FROM "RequestOutcome"
        WHERE "path" = ${path} AND "occurredAt" >= ${since}
      `,
    ]);

    const successRatePct = totalRequests > 0 ? (succeededRequests / totalRequests) * 100 : null;
    const p95LatencyMs = p95Rows[0]?.p95 ?? null;

    let remainingBudgetMinutes: number | null = null;
    let overBudget = false;

    if (target.successTargetPct !== null) {
      const windowMinutes = TRAILING_WINDOW_DAYS * 24 * 60;
      const allowedFailureRate = 1 - target.successTargetPct / 100;
      const allowedDowntimeMinutes = windowMinutes * allowedFailureRate;
      const observedFailureRate = totalRequests > 0 ? 1 - succeededRequests / totalRequests : 0;
      const burnRate = allowedFailureRate > 0 ? observedFailureRate / allowedFailureRate : observedFailureRate > 0 ? Infinity : 0;
      remainingBudgetMinutes = allowedDowntimeMinutes * (1 - burnRate);
      overBudget = remainingBudgetMinutes < 0;
    }

    return {
      path,
      label: target.label,
      windowDays: TRAILING_WINDOW_DAYS,
      totalRequests,
      succeededRequests,
      successRatePct,
      successTargetPct: target.successTargetPct,
      p95LatencyMs,
      latencyTargetMs: target.latencyTargetMs,
      latencyTargetLabel: target.latencyTargetLabel,
      remainingBudgetMinutes,
      overBudget,
    };
  }

  async computeAllBudgets(): Promise<SloBudget[]> {
    return Promise.all(Object.values(SLO_PATHS).map((path) => this.computeBudget(path)));
  }
}

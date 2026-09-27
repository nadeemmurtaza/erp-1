/**
 * The three critical paths named in 38-resilience-engineering.md §3 — the
 * only paths in this codebase with a formal SLO. Adding a fourth critical
 * path is an entry here, never a schema change (`RequestOutcome.path` is a
 * plain string).
 */
export const SLO_PATHS = {
  Checkout: 'checkout',
  PosSale: 'pos.sale',
  ReplicationSync: 'replication.sync',
} as const;

export type SloPath = (typeof SLO_PATHS)[keyof typeof SLO_PATHS];

export interface SloTarget {
  label: string;
  /**
   * Percentage (e.g. 99.9) used to compute a trailing-30-day error budget
   * in minutes — null for `replication.sync`. Doc 38 §3 states an error
   * budget only for the two paths with a percentage SLO; `replication
   * .sync`'s own stated bound is a hard latency bound ("facts land within
   * 4 hours"), not a percentage, so "error budget in minutes" is not a
   * question this path answers — its dashboard card shows success rate
   * against that bound instead, never a fabricated percentage target the
   * document never stated.
   */
  successTargetPct: number | null;
  /** ms — the p95 latency target (checkout/pos.sale) or the latency bound itself (replication.sync). */
  latencyTargetMs: number;
  /** How the latency figure should read in the dashboard, e.g. "p95 < 800ms" or "backlog age < 4h". */
  latencyTargetLabel: string;
}

export const SLO_TARGETS: Record<SloPath, SloTarget> = {
  [SLO_PATHS.Checkout]: {
    label: 'Checkout',
    successTargetPct: 99.9,
    latencyTargetMs: 800,
    latencyTargetLabel: 'p95 < 800ms',
  },
  [SLO_PATHS.PosSale]: {
    label: 'POS sale completion',
    successTargetPct: 99.95,
    latencyTargetMs: 400,
    latencyTargetLabel: 'p95 < 400ms',
  },
  [SLO_PATHS.ReplicationSync]: {
    label: 'Till → parent sync',
    successTargetPct: null,
    latencyTargetMs: 4 * 60 * 60 * 1000,
    latencyTargetLabel: 'backlog age < 4h',
  },
};

export const TRAILING_WINDOW_DAYS = 30;

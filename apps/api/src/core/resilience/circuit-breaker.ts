/**
 * Extension point (38-resilience-engineering.md §2): the three-state gate
 * every existing extension-point call sits behind — `AiProvider`,
 * `PaymentProvider` and `VectorStore` today (see `circuit-breaker.service
 * .ts`'s own header for the fourth, `OutboundConnector`, which doc 36 has
 * not shipped yet). Generalizes `outbox.dispatcher.ts`'s exponential
 * backoff: backoff decides *when* to retry a call already in flight; this
 * decides whether to even attempt one, so a dependency that is clearly
 * down stops taking doomed attempts instead of queuing thousands of them.
 */
export interface CircuitBreaker {
  /** Throws immediately without calling fn() if the circuit is OPEN. */
  execute<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** Thrown by `execute()` instead of calling `fn()` while a circuit is OPEN. */
export class CircuitOpenError extends Error {
  constructor(
    public readonly key: string,
    public readonly retryAfterMs: number,
  ) {
    super(`Circuit "${key}" is open — failing fast for another ${Math.ceil(retryAfterMs / 1000)}s.`);
    this.name = 'CircuitOpenError';
  }
}

export interface CircuitBreakerOptions {
  /** Consecutive failures before the circuit opens. Default 5. */
  failureThreshold: number;
  /** How long the circuit stays OPEN before a HALF_OPEN trial call. Default 30_000ms. */
  cooldownMs: number;
}

export const DEFAULT_CIRCUIT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  cooldownMs: 30_000,
};

/** Read-only snapshot of one circuit's current state — the admin dashboard's own shape. */
export interface CircuitSnapshot {
  key: string;
  state: CircuitState;
  failureCount: number;
  options: CircuitBreakerOptions;
  /** ISO — null unless the circuit is currently OPEN or HALF_OPEN. */
  openedAt: string | null;
  /** ISO — null if this circuit has never seen a call. */
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
}

/** One point in a simulated call history — see `CircuitBreakerService.simulate()`. */
export interface SimulatedCallOutcome {
  occurredAt: Date;
  succeeded: boolean;
}

export interface SimulationTransition {
  at: string;
  action: 'OPEN' | 'CLOSE';
}

export interface SimulationResult {
  wouldHaveTripped: boolean;
  transitions: SimulationTransition[];
  /** How many of the OPEN windows below would have failed calls fast that a caller never even attempted. */
  openWindowCount: number;
}

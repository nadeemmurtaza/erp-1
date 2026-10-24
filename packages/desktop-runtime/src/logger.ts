/**
 * 48-native-desktop-deployment.md — a minimal structured-logging seam.
 *
 * This package runs outside `apps/api`'s NestJS process (it is the
 * orchestration that starts Postgres and runs first-run setup *before*
 * that process can even boot — see WO-48.1/48.3), so it cannot reach for
 * Nest's `Logger` the way `.claude/rules/services.md` asks every
 * `apps/api` service to. The discipline is the same regardless of the
 * runtime: never `console.log`, log what happened/when/which operation/
 * what failed, never log a secret. A future desktop shell injects its own
 * `DesktopLogger` (its own file, its own telemetry); the default here is
 * the smallest thing that satisfies "never silently swallow an error"
 * without pulling in a logging framework this package does not need.
 */
export interface DesktopLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** `console.warn`/`console.error` only — both allowed by this repo's own
 * eslint base (`no-console: ['warn', { allow: ['warn', 'error'] }]`).
 * `info` still goes to stderr via `console.warn` rather than `console.log`
 * so a caller piping stdout (e.g. a setup wizard reading JSON progress)
 * never has a stray log line land in its own output stream. */
export const consoleDesktopLogger: DesktopLogger = {
  info: (message, meta) => console.warn(`[desktop-runtime] ${message}`, meta ?? ''),
  warn: (message, meta) => console.warn(`[desktop-runtime] ${message}`, meta ?? ''),
  error: (message, meta) => console.error(`[desktop-runtime] ${message}`, meta ?? ''),
};

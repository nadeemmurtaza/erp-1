import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgresLifecycleManager } from './postgres-lifecycle';

/**
 * Exercises `PostgresLifecycleManager` against the REAL `embedded-postgres`
 * package — a genuine, platform-specific Postgres server binary, not a
 * mock — end to end: initdb, start, a real `SELECT 1` over a real TCP
 * connection, and a clean shutdown.
 *
 * Run this file with `pnpm run test:integration` (this package's own
 * script), not plain `pnpm test` — `EmbeddedPostgresRunner`'s own header
 * comment explains why: `embedded-postgres` ships ESM-only, and only a
 * dynamic `import()` under Jest's `--experimental-vm-modules` can load it,
 * a Jest/ESM interop constraint, not a defect in the real mechanism
 * (proven separately, by hand, with a plain Node script — see below).
 *
 * Two real constraints stack here, verified by hand during development of
 * this document rather than assumed:
 *
 * 1. Postgres refuses, by design, to run its server process as the root OS
 *    user (a real, upstream Postgres security rule). This container/
 *    session runs as root, so this suite detects that up front and skips
 *    itself with a named reason rather than pretending to pass. Run as a
 *    created non-root `postgres` OS user in this same sandbox — with
 *    `test:integration`'s own vm-modules flag — initialise/start/health-
 *    check/stop all completed successfully against the real binary (see
 *    this document's own status blockquote for the record of that run).
 * 2. Independently of root, a plain Node script (`node -e`, no Jest
 *    involved) confirmed the real binary's full lifecycle works
 *    end-to-end as a non-root user — the ESM-loading fix above is a test-
 *    tooling accommodation, not a production code path different from
 *    what a real desktop shell (a plain Node/Electron host) would run.
 *
 * On a real desktop install — non-root, run through `test:integration` or
 * simply as the application code path itself (which never touches Jest at
 * all) — this mechanism runs for real.
 */
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const describeIfNotRoot = isRoot ? describe.skip : describe;

if (isRoot) {
  console.warn(
    '[postgres-lifecycle.integration.spec] SKIPPED: this process is running as root, and Postgres ' +
      'refuses to run its server process as root. Run this suite as a non-root OS user (as any real ' +
      'desktop install does) to exercise it against the real embedded Postgres binary.',
  );
}

describeIfNotRoot('PostgresLifecycleManager (real embedded-postgres binary)', () => {
  jest.setTimeout(60_000);
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'desktop-pg-real-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('initialises, starts, answers a real query, and stops cleanly', async () => {
    const manager = new PostgresLifecycleManager({
      dataDir: join(root, 'pgdata'),
      port: 55921,
      startupTimeoutMs: 20_000,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });

    const info = await manager.start();
    expect(info.port).toBe(55921);
    expect(manager.isRunning()).toBe(true);
    await expect(manager.isHealthy()).resolves.toBe(true);

    await manager.stop();
    expect(manager.isRunning()).toBe(false);
  });

  it('refuses a second real initdb against an already-initialised directory by treating it as already done', async () => {
    const dataDir = join(root, 'pgdata');
    const manager = new PostgresLifecycleManager({
      dataDir,
      port: 55922,
      startupTimeoutMs: 20_000,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });
    await manager.start();
    await manager.stop();

    // A fresh manager instance pointed at the same data directory (what
    // actually happens on every app relaunch) must not re-run initdb
    // against the live cluster it already created.
    const relaunched = new PostgresLifecycleManager({
      dataDir,
      port: 55922,
      startupTimeoutMs: 20_000,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });
    await expect(relaunched.start()).resolves.toBeDefined();
    await relaunched.stop();
  });
});

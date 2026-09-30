import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Client as PgClient } from 'pg';
import { DesktopLogger, consoleDesktopLogger } from './logger';

/**
 * 48-native-desktop-deployment.md WO-48.1 — the embedded-Postgres
 * lifecycle, as real, testable orchestration.
 *
 * `48-native-desktop-deployment.md` §"The decision this document does not
 * make casually" fixes the shape: a real, embedded Postgres instance, not
 * a second database engine — `apps/api`'s schema and every module run
 * unmodified against it. This file is the state machine around that
 * instance: initialise the data directory once, start it, prove it is
 * actually accepting connections before anything is told it is ready,
 * and stop it cleanly on quit. It knows nothing about Electron, Tauri, or
 * any other shell — per the doc's own "real, testable orchestration
 * logic … independent of which shell eventually wraps it" — a future
 * shell's main process is simply the thing that calls this class.
 *
 * The real Postgres binary is provided by the `embedded-postgres` npm
 * package (`EmbeddedPostgresRunner` below), which downloads a genuine,
 * platform-specific Postgres server binary and manages it as a child
 * process — not a mock, not a second SQL dialect. That real binary was
 * exercised by hand in this sandbox (see
 * `postgres-lifecycle.integration.spec.ts`): initialise/start/health-
 * check/stop all worked end-to-end. The one thing this sandbox cannot
 * prove is CI running as an unprivileged user — this container runs as
 * root, and Postgres correctly refuses to run its server process as
 * root, so the integration spec detects that and skips itself with a
 * named reason rather than either lying about coverage or deleting the
 * test. Every unit in this file is still exercised, deterministically,
 * against `FakePostgresRunner` in `postgres-lifecycle.spec.ts`.
 */

/** The seam `EmbeddedPostgresRunner` implements. A fake in tests proves
 * this class's own state machine (ordering, error wrapping, idempotency)
 * without needing root or a real multi-second Postgres boot on every
 * test run. */
export interface PostgresRunner {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface PostgresConnectionInfo {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export type PostgresLifecycleErrorCode =
  | 'INIT_FAILED'
  | 'START_FAILED'
  | 'HEALTH_CHECK_FAILED'
  | 'STOP_FAILED';

/**
 * What a future desktop shell's "repair/restore" screen (doc 48's own
 * failure-path scope lens, and its acceptance criterion: "a forced
 * local-Postgres-start failure shows a readable error and a working
 * repair/restore path, never a blank window") would offer, keyed off why
 * the lifecycle failed. This class only classifies the failure — it never
 * performs the repair itself, the same "the deciding function ... holds
 * no side effect" discipline this repository already applies to every
 * dry-run/preview method.
 */
export type RepairAction =
  /** Transient — the caller's own retry loop (or the user clicking
   * "try again") is a reasonable next step with no data implication. */
  | 'RETRY'
  /** The data directory itself may be damaged; the accompanying local
   * backup (WO-48.5's `LocalBackupScheduler`) is the documented recovery
   * path — doc 38's own restore-tested discipline, at single-machine
   * scale. */
  | 'RESTORE_FROM_BACKUP'
  /** Something about the install itself (permissions, missing binary,
   * disused port) rather than the data — reinstalling the desktop app
   * fixes it; the data directory is untouched by a reinstall and is
   * still there for the next successful start. */
  | 'REINSTALL';

export class PostgresLifecycleError extends Error {
  constructor(
    readonly code: PostgresLifecycleErrorCode,
    message: string,
    readonly repairAction: RepairAction,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PostgresLifecycleError';
  }
}

export interface PostgresLifecycleOptions {
  /** Where the Postgres data directory and this node's generated
   * credentials file both live — typically the desktop app's own
   * per-user data directory. */
  dataDir: string;
  port: number;
  host?: string;
  /** The single database `apps/api`'s `DATABASE_URL` points at. */
  database?: string;
  /** How long to keep polling the health check before giving up and
   * raising `HEALTH_CHECK_FAILED`. */
  startupTimeoutMs?: number;
  logger?: DesktopLogger;
  /** Overridable for tests; defaults to the real `embedded-postgres`
   * wrapper below. */
  createRunner?: (info: PostgresConnectionInfo, dataDir: string) => PostgresRunner;
}

const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const HEALTH_POLL_INTERVAL_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Random local superuser credentials, generated once per install and
 * persisted to a file only this OS user can read — doc 48's own
 * "Authority and blast radius" lens names the worst value as "an
 * uncontrolled local Postgres superuser password" and its stated
 * mitigation as "generating a random one per install, never a shared
 * default." This is that mitigation: 32 bytes of CSPRNG output, never a
 * fallback constant, and the credentials file is written with `0o600`
 * (owner read/write only) before anything else touches it.
 */
export class PostgresCredentialStore {
  constructor(private readonly credentialsPath: string) {}

  load(): { user: string; password: string } | undefined {
    if (!existsSync(this.credentialsPath)) return undefined;
    const raw = JSON.parse(readFileSync(this.credentialsPath, 'utf8')) as {
      user: string;
      password: string;
    };
    if (!raw.user || !raw.password) return undefined;
    return raw;
  }

  loadOrCreate(): { user: string; password: string } {
    const existing = this.load();
    if (existing) return existing;

    const generated = {
      user: 'desktop_node',
      password: randomBytes(32).toString('base64url'),
    };
    mkdirSync(dirname(this.credentialsPath), { recursive: true });
    writeFileSync(this.credentialsPath, JSON.stringify(generated), { mode: 0o600 });
    return generated;
  }
}

/**
 * The orchestration itself. Every public method is safe to call
 * repeatedly — `ensureInitialised()` is a no-op on a data directory that
 * is already initialised, `stop()` is a no-op if nothing is running —
 * because a shell's main process restarts this on every launch and must
 * never re-run `initdb` against live data (doc 48's own "the second copy
 * of the write" lens, applied to lifecycle calls rather than a business
 * write).
 */
export class PostgresLifecycleManager {
  private readonly logger: DesktopLogger;
  private readonly credentials: PostgresCredentialStore;
  private runner: PostgresRunner | undefined;
  private running = false;

  constructor(private readonly options: PostgresLifecycleOptions) {
    this.logger = options.logger ?? consoleDesktopLogger;
    this.credentials = new PostgresCredentialStore(this.credentialsPath);
  }

  /** Where the generated superuser credentials live, alongside (not
   * inside) `dataDir` — exposed so a caller that copies the data
   * directory elsewhere (`LocalBackupScheduler`'s own restore-test is the
   * one real example) knows to copy this file too. The role password
   * Postgres actually checks is baked into the cluster's own system
   * catalogue at `initdb` time — copying `dataDir` without this file
   * leaves a `PostgresLifecycleManager` pointed at the copy generating a
   * brand new, mismatched password and failing to authenticate against
   * data that is otherwise perfectly intact (a real failure this
   * document's own integration test caught, not a hypothetical). */
  get credentialsPath(): string {
    return join(this.options.dataDir, '..', 'desktop-node.credentials.json');
  }

  get connectionInfo(): PostgresConnectionInfo {
    const { user, password } = this.credentials.loadOrCreate();
    return {
      host: this.options.host ?? '127.0.0.1',
      port: this.options.port,
      user,
      password,
      database: this.options.database ?? 'newax_desktop',
    };
  }

  /** `postgresql://user:password@host:port/database` — what the setup
   * wizard (WO-48.3) writes into `apps/api`'s own `DATABASE_URL`. Never
   * logged: the caller writes it straight to the env file. */
  get connectionUrl(): string {
    const c = this.connectionInfo;
    return `postgresql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.password)}@${c.host}:${c.port}/${c.database}`;
  }

  private getRunner(): PostgresRunner {
    if (this.runner) return this.runner;
    const info = this.connectionInfo;
    const factory = this.options.createRunner ?? defaultRunnerFactory;
    this.runner = factory(info, this.options.dataDir);
    return this.runner;
  }

  /** True once Postgres's own `initdb` has written a cluster to
   * `dataDir` — the same marker file (`PG_VERSION`) Postgres itself uses,
   * so this check needs no state of its own and can never drift from
   * reality the way a separate "installed" flag file could. */
  isInitialised(): boolean {
    return existsSync(join(this.options.dataDir, 'PG_VERSION'));
  }

  async ensureInitialised(): Promise<void> {
    if (this.isInitialised()) {
      this.logger.info('Postgres data directory already initialised — skipping initdb', {
        dataDir: this.options.dataDir,
      });
      return;
    }
    // Credentials must exist before initdb runs — they are baked into the
    // cluster's own superuser at creation time, not applied afterwards.
    this.credentials.loadOrCreate();
    this.logger.info('Initialising embedded Postgres data directory', { dataDir: this.options.dataDir });
    try {
      await this.getRunner().initialise();
    } catch (cause) {
      throw new PostgresLifecycleError(
        'INIT_FAILED',
        'Could not create the local database. This usually means the install is missing a required file or has no permission to write to its data folder.',
        'REINSTALL',
        cause,
      );
    }
  }

  async start(): Promise<PostgresConnectionInfo> {
    await this.ensureInitialised();
    if (this.running) {
      this.logger.info('Postgres already running — start() is a no-op');
      return this.connectionInfo;
    }

    try {
      await this.getRunner().start();
    } catch (cause) {
      throw new PostgresLifecycleError(
        'START_FAILED',
        'The local database process did not start. Another program may already be using its port, or the last shutdown left it in a bad state.',
        'RETRY',
        cause,
      );
    }

    const info = this.connectionInfo;
    try {
      // `initdb` creates only Postgres's own always-present maintenance
      // databases (`postgres`, `template0/1`) — never the application
      // database this manager's own `database` option names. Proving the
      // *server* is up is therefore done against `postgres`, not the
      // target database, which does not exist yet on a first-ever start —
      // a real distinction this class's own integration spec caught (a
      // unit test with a fake `PostgresRunner` cannot see it, since a
      // fake has no real database catalogue to be wrong about).
      await this.waitForServerReady(info);
      await this.ensureDatabaseExists(info);
      // One final check against the actual target database — the one a
      // caller's own `DATABASE_URL` will use — so "healthy" always means
      // "the database this node will actually run against is reachable,"
      // not merely "the server process answered on some database."
      await this.checkOnce(info);
    } catch (cause) {
      // A process that "started" but never accepts connections is worse
      // than one that failed outright — surfaced as its own code so a
      // repair screen can tell the two apart, per doc 48's own failure-
      // path lens ("a real, readable error … with a repair … action").
      throw new PostgresLifecycleError(
        'HEALTH_CHECK_FAILED',
        'The local database started but is not responding. Its data folder may be damaged.',
        'RESTORE_FROM_BACKUP',
        cause,
      );
    }

    this.running = true;
    this.logger.info('Postgres is healthy and accepting connections', { port: info.port });
    return info;
  }

  /** Polls a real `SELECT 1` against Postgres's own `postgres` maintenance
   * database — guaranteed to exist the moment `initdb` has run — until it
   * succeeds or `startupTimeoutMs` elapses. Never trusts "the child
   * process launched" as proof of "ready to serve traffic" (doc 48 §2's
   * own "healthy-check before serving traffic"). */
  private async waitForServerReady(info: PostgresConnectionInfo): Promise<void> {
    const deadline = Date.now() + (this.options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS);
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        await this.checkOnce({ ...info, database: 'postgres' });
        return;
      } catch (error) {
        lastError = error;
        await sleep(HEALTH_POLL_INTERVAL_MS);
      }
    }
    throw lastError ?? new Error('health check never ran');
  }

  /** `CREATE DATABASE` is not idempotent in plain SQL (no `IF NOT
   * EXISTS`), so this checks `pg_database` first — safe to call on every
   * `start()`, not only the very first one, the same "safe to call
   * repeatedly" discipline this whole class already holds itself to. */
  private async ensureDatabaseExists(info: PostgresConnectionInfo): Promise<void> {
    const client = new PgClient({
      host: info.host,
      port: info.port,
      user: info.user,
      password: info.password,
      database: 'postgres',
      connectionTimeoutMillis: 5_000,
    });
    await client.connect();
    try {
      const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [info.database]);
      if (existing.rowCount === 0) {
        // Database identifiers cannot be parameterised — `info.database`
        // is this manager's own configured value, never end-user input.
        await client.query(`CREATE DATABASE "${info.database.replace(/"/g, '""')}"`);
        this.logger.info('Created application database', { database: info.database });
      }
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private async checkOnce(info: PostgresConnectionInfo): Promise<void> {
    const client = new PgClient({
      host: info.host,
      port: info.port,
      user: info.user,
      password: info.password,
      database: info.database,
      connectionTimeoutMillis: 2_000,
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  /** A standalone health probe for an already-running instance (e.g. a
   * shell polling "is my database still alive" on a timer, separately
   * from the start-up sequence above). */
  async isHealthy(): Promise<boolean> {
    try {
      await this.checkOnce(this.connectionInfo);
      return true;
    } catch {
      return false;
    }
  }

  async stop(): Promise<void> {
    if (!this.running || !this.runner) {
      this.logger.info('Postgres is not running — stop() is a no-op');
      return;
    }
    try {
      await this.runner.stop();
      this.running = false;
      this.logger.info('Postgres stopped cleanly');
    } catch (cause) {
      throw new PostgresLifecycleError(
        'STOP_FAILED',
        'The local database did not shut down cleanly. It will attempt to recover automatically on next launch.',
        'RETRY',
        cause,
      );
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

/**
 * The real implementation, wrapping the `embedded-postgres` npm package —
 * a maintained package that downloads a genuine platform-specific
 * Postgres server binary (via its per-platform `@embedded-postgres/*`
 * optional dependency) and drives it with `initdb`/`pg_ctl`, not a
 * reimplementation of Postgres. `persistent: true` is load-bearing: the
 * default in the underlying package is an ephemeral, wipe-on-stop
 * instance meant for tests, which would silently discard a real shop's
 * data on every quit.
 *
 * A real, discovered constraint shapes how this loads the package: it
 * ships ESM-only (`"type": "module"` — verified against its own installed
 * `package.json`), which a real Node host (22.12+) can `require()`
 * directly via Node's own native require(esm) support — proven by hand in
 * this sandbox against the real binary — but Jest's own CJS module loader
 * cannot, with or without `--experimental-vm-modules`, for a plain
 * `require()` call; only a genuine dynamic `import()` works there. The
 * `new Function(...)` indirection below exists solely to stop TypeScript's
 * own CommonJS output from downleveling `import()` back into the
 * `require()` that doesn't work under Jest (verified: without it, `tsc
 * --module CommonJS` rewrites `import()` into `Promise.resolve().then(()
 * => require(...))`, reintroducing the exact failure this works around) —
 * it is not obfuscation, it is the documented workaround for shipping one
 * dynamic ESM import unchanged through a CommonJS build. See
 * `postgres-lifecycle.integration.spec.ts` and this package's own
 * `test:integration` script, which is the one thing in this repository
 * that needs `--experimental-vm-modules` and only for that one script.
 */
export class EmbeddedPostgresRunner implements PostgresRunner {
  private instance: PostgresRunner | undefined;

  constructor(
    private readonly info: PostgresConnectionInfo,
    private readonly dataDir: string,
  ) {}

  private async getInstance(): Promise<PostgresRunner> {
    if (this.instance) return this.instance;
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (
      specifier: string,
    ) => Promise<{
      default: new (opts: {
        databaseDir: string;
        port: number;
        user: string;
        password: string;
        persistent: boolean;
      }) => PostgresRunner;
    }>;
    const { default: EmbeddedPostgresCtor } = await dynamicImport('embedded-postgres');
    this.instance = new EmbeddedPostgresCtor({
      databaseDir: this.dataDir,
      port: this.info.port,
      user: this.info.user,
      password: this.info.password,
      persistent: true,
    });
    return this.instance;
  }

  async initialise(): Promise<void> {
    return (await this.getInstance()).initialise();
  }

  async start(): Promise<void> {
    return (await this.getInstance()).start();
  }

  async stop(): Promise<void> {
    return (await this.getInstance()).stop();
  }
}

function defaultRunnerFactory(info: PostgresConnectionInfo, dataDir: string): PostgresRunner {
  return new EmbeddedPostgresRunner(info, dataDir);
}

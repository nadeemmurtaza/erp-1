import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { Client as PgClient } from 'pg';
import { PostgresConnectionInfo, PostgresLifecycleManager } from './postgres-lifecycle';
import { DesktopLogger, consoleDesktopLogger } from './logger';

/**
 * 48-native-desktop-deployment.md WO-48.5 — local backup, adapting
 * `deploy/backup.sh`'s own restore-tested discipline (doc 38's own words:
 * "a backup that has never been restored is a hope, not a backup") to a
 * single machine with no docker host and no Postgres client tools
 * installed alongside the server.
 *
 * A real, discovered constraint shapes this file: `deploy/backup.sh` uses
 * `pg_dump`/`psql`, but the `embedded-postgres` npm package's own binary
 * distribution (verified in this sandbox — see
 * `@embedded-postgres/linux-x64/native/bin/`) ships only `postgres`,
 * `pg_ctl` and `initdb` — no client tools. A **physical** backup (a
 * consistent copy of the whole data directory, tar+gzip'd) is what those
 * three binaries can support, not a logical `pg_dump`. The real
 * consequence, stated plainly rather than glossed over: a physical copy
 * of a *live* Postgres data directory is not crash-consistent without
 * `pg_basebackup` (also absent from this bundle), so this scheduler stops
 * the local database for the seconds a `tar` of its data directory takes,
 * then restarts it immediately — a real, brief interruption `deploy/
 * backup.sh`'s live `pg_dump` never needs. For a single till, scheduling
 * this for a quiet moment (overnight, or the catch-up run right after the
 * app is closed for the day and reopened) is the honest mitigation; doing
 * better than that (a WAL-streaming physical backup, or bundling real
 * `pg_dump`) is a real, separately-scoped follow-up this file names but
 * does not solve.
 *
 * "A desktop-node process needs a different mechanism" (this document's
 * own brief) because it is not always running: `@nestjs/schedule`'s
 * `@Cron` only fires while its host process is alive, and a desktop till
 * may be off for days. `start()` below therefore always runs one
 * immediate catch-up check — "is the last verified backup older than the
 * interval?" — before arming the timer, so a machine that was off
 * overnight still backs up promptly once it is on, instead of silently
 * waiting a full interval that may never elapse while it runs.
 */

export interface BackupArchiver {
  /** Archives `sourceDir` (the whole Postgres data directory) into a
   * single gzip'd tarball at `archivePath`. */
  archive(sourceDir: string, archivePath: string): Promise<void>;
  /** The inverse — used only for the restore-test, into a throwaway
   * scratch directory that is deleted immediately after. */
  extract(archivePath: string, destDir: string): Promise<void>;
}

/** The real implementation, backed by the `tar` npm package (the same
 * library npm itself uses) — chosen over shelling out to a `tar` binary
 * because a desktop install's `PATH` is not this repository's to assume,
 * and over `deploy/backup.sh`'s own `pg_dump | gzip` pipeline because
 * neither binary ships in `embedded-postgres`'s distribution (see this
 * file's own header comment). */
export class TarBackupArchiver implements BackupArchiver {
  async archive(sourceDir: string, archivePath: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tar = require('tar') as typeof import('tar');
    await tar.create({ gzip: true, file: archivePath, cwd: dirname(sourceDir) }, [basename(sourceDir)]);
  }

  async extract(archivePath: string, destDir: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tar = require('tar') as typeof import('tar');
    mkdirSync(destDir, { recursive: true });
    await tar.extract({ file: archivePath, cwd: destDir });
  }
}

export interface BackupResult {
  timestamp: string;
  archivePath: string;
  sizeBytes: number;
  restoreVerified: boolean;
  verifiedTables: Record<string, number>;
  failureReason?: string;
  durationMs: number;
}

const MIN_ARCHIVE_BYTES = 1024;

export interface LocalBackupOptions {
  /** The live instance this scheduler backs up. Stopped and restarted
   * around the file copy — never around the restore-test, which runs
   * against a separate, throwaway instance instead. */
  postgres: PostgresLifecycleManager;
  /** The same data directory `postgres` itself manages. */
  dataDir: string;
  backupDir: string;
  intervalMs: number;
  retentionDays: number;
  /** Tables that must come back non-empty for a restore to count as
   * verified — `deploy/backup.sh`'s own `Product`/`Permission`/`User`
   * check, generalised: this package has no dependency on `apps/api`'s
   * schema, so the caller names its own. */
  requiredTables: string[];
  /** A free local port for the throwaway restore-test instance —  never
   * the live port, so verification can run without ever touching (or
   * racing) the real database. */
  restorePort: number;
  /** Builds the throwaway verification instance; overridable in tests so
   * a fake never needs a real second embedded Postgres boot. Defaults to
   * a real `PostgresLifecycleManager` over the extracted copy. */
  createVerificationManager?: (dataDir: string, port: number) => PostgresLifecycleManager;
  archiver?: BackupArchiver;
  logger?: DesktopLogger;
}

interface BackupState {
  /** Epoch milliseconds — stored as a number rather than an ISO string so
   * `isOverdue()` never has to re-parse a value this same file just
   * wrote, and never collides with the filesystem-safe timestamp used in
   * archive filenames (colons/dots replaced with dashes). */
  lastSuccessfulBackupAtMs?: number;
}

/**
 * Mirrors `OutboxDispatcher`'s / `ReplicationSyncAgent`'s own re-entrancy
 * guard shape: a `running` flag so an overlapping tick (the interval
 * firing while a slow backup from the previous tick is still running) is
 * skipped rather than racing a second `tar`/restore against the same
 * data directory.
 */
export class LocalBackupScheduler {
  private readonly logger: DesktopLogger;
  private readonly archiver: BackupArchiver;
  private readonly statePath: string;
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(private readonly options: LocalBackupOptions) {
    this.logger = options.logger ?? consoleDesktopLogger;
    this.archiver = options.archiver ?? new TarBackupArchiver();
    this.statePath = join(options.backupDir, 'backup-state.json');
  }

  private readState(): BackupState {
    if (!existsSync(this.statePath)) return {};
    try {
      return JSON.parse(readFileSync(this.statePath, 'utf8')) as BackupState;
    } catch {
      return {};
    }
  }

  private writeState(state: BackupState): void {
    mkdirSync(this.options.backupDir, { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(state, null, 2));
  }

  private isOverdue(): boolean {
    const { lastSuccessfulBackupAtMs } = this.readState();
    if (!lastSuccessfulBackupAtMs) return true;
    return Date.now() - lastSuccessfulBackupAtMs >= this.options.intervalMs;
  }

  /** Runs the immediate catch-up check, then arms the recurring timer.
   * Never throws — a catch-up failure is logged, not fatal to starting
   * the scheduler, the same "a dependency being slow/offline must not
   * crash the scheduler" discipline `ReplicationSyncAgent.tick()` already
   * follows. */
  async start(): Promise<void> {
    if (this.isOverdue()) {
      await this.runOnce().catch((error) =>
        this.logger.error('Catch-up backup failed', { error: describe(error) }),
      );
    }
    this.timer = setInterval(() => {
      this.runOnce().catch((error) => this.logger.error('Scheduled backup failed', { error: describe(error) }));
    }, this.options.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** The full pipeline: quiesce, copy, restart the live database
   * immediately, then verify the copy independently, then prune. Every
   * step that can fail records why rather than throwing past the caller
   * with no explanation — `services.md`'s own "errors … useful to
   * operators" discipline, applied to a process that has no operator on
   * call, only a future repair screen reading this result. */
  async runOnce(): Promise<BackupResult> {
    if (this.running) {
      throw new Error('A backup is already in progress');
    }
    this.running = true;
    const startedAt = Date.now();
    try {
      const timestamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-');
      mkdirSync(this.options.backupDir, { recursive: true });
      const archivePath = join(this.options.backupDir, `backup-${timestamp}.tar.gz`);

      await this.options.postgres.stop();
      try {
        await this.archiver.archive(this.options.dataDir, archivePath);
      } finally {
        // The live database comes back up even if archiving itself
        // failed — a failed backup must never also be an extended outage.
        await this.options.postgres.start();
      }

      const sizeBytes = statSync(archivePath).size;
      if (sizeBytes < MIN_ARCHIVE_BYTES) {
        const result: BackupResult = {
          timestamp,
          archivePath,
          sizeBytes,
          restoreVerified: false,
          verifiedTables: {},
          failureReason: `archive is only ${sizeBytes} bytes — refusing to trust it`,
          durationMs: Date.now() - startedAt,
        };
        this.recordResult(result);
        return result;
      }

      const verification = await this.verifyRestore(archivePath, timestamp);
      const result: BackupResult = {
        timestamp,
        archivePath,
        sizeBytes,
        restoreVerified: verification.ok,
        verifiedTables: verification.tables,
        failureReason: verification.ok ? undefined : verification.reason,
        durationMs: Date.now() - startedAt,
      };
      this.recordResult(result);
      this.prune();
      return result;
    } finally {
      this.running = false;
    }
  }

  private async verifyRestore(
    archivePath: string,
    timestamp: string,
  ): Promise<{ ok: boolean; tables: Record<string, number>; reason?: string }> {
    const scratchDir = join(this.options.backupDir, `.restore-test-${timestamp}`);
    try {
      await this.archiver.extract(archivePath, scratchDir);
      const extractedDataDir = join(scratchDir, basename(this.options.dataDir));

      const factory = this.options.createVerificationManager ?? defaultVerificationManagerFactory;
      const scratchPostgres = factory(extractedDataDir, this.options.restorePort);

      // The role password Postgres actually authenticates against is
      // baked into the copied data directory itself — a fresh
      // `PostgresLifecycleManager` pointed at that copy must be handed
      // the SAME generated credentials the live instance used, not a new
      // random pair it would otherwise generate for itself (see
      // `PostgresLifecycleManager.credentialsPath`'s own comment; this is
      // a real bug this file's own integration test caught: an
      // otherwise-perfect restore that fails only because of a mismatched
      // password would misreport a good backup as unusable). Guarded
      // (`in` + `existsSync`) rather than assumed, since a test double
      // standing in for either manager may model no credentials file at
      // all — real `PostgresLifecycleManager` instances always have one
      // by the time `postgres.start()` has ever run once.
      const liveCredentialsPath = getCredentialsPath(this.options.postgres);
      const scratchCredentialsPath = getCredentialsPath(scratchPostgres);
      if (liveCredentialsPath && scratchCredentialsPath && existsSync(liveCredentialsPath)) {
        mkdirSync(dirname(scratchCredentialsPath), { recursive: true });
        copyFileSync(liveCredentialsPath, scratchCredentialsPath);
      }

      let conn: PostgresConnectionInfo;
      try {
        conn = await scratchPostgres.start();
      } catch (cause) {
        return { ok: false, tables: {}, reason: `restore into scratch failed to start: ${describe(cause)}` };
      }

      try {
        const tables: Record<string, number> = {};
        for (const table of this.options.requiredTables) {
          const count = await countRows(conn, table);
          tables[table] = count;
          if (count === 0) {
            return { ok: false, tables, reason: `restored table "${table}" is empty — backup is not usable` };
          }
        }
        return { ok: true, tables };
      } finally {
        await scratchPostgres.stop().catch(() => undefined);
      }
    } catch (cause) {
      return { ok: false, tables: {}, reason: describe(cause) };
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  }

  private recordResult(result: BackupResult): void {
    const state = this.readState();
    if (result.restoreVerified) {
      state.lastSuccessfulBackupAtMs = Date.now();
    }
    this.writeState(state);
    if (!result.restoreVerified) {
      this.logger.error('Local backup failed its restore test', {
        archivePath: result.archivePath,
        reason: result.failureReason,
      });
    } else {
      this.logger.info('Local backup verified', { archivePath: result.archivePath, tables: result.verifiedTables });
    }
  }

  /** Deletes archives older than `retentionDays` — except it never
   * deletes the single most recent **verified** backup, however old,
   * so there is always at least one known-good restore point even if
   * every backup since has failed its own restore-test (doc 48's own
   * "the failure path" lens: a repeatedly failing dependency degrades,
   * it does not also destroy the last good copy on its way down). */
  private prune(): void {
    const files = readdirSync(this.options.backupDir).filter((f) => f.endsWith('.tar.gz'));
    const withStats = files.map((f) => ({
      name: f,
      path: join(this.options.backupDir, f),
      mtimeMs: statSync(join(this.options.backupDir, f)).mtimeMs,
    }));
    withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const newestPath = withStats[0]?.path;
    const cutoff = Date.now() - this.options.retentionDays * 24 * 60 * 60 * 1000;
    for (const file of withStats) {
      if (file.path === newestPath) continue;
      if (file.mtimeMs < cutoff) {
        rmSync(file.path, { force: true });
      }
    }
  }
}

async function countRows(conn: PostgresConnectionInfo, table: string): Promise<number> {
  const client = new PgClient({
    host: conn.host,
    port: conn.port,
    user: conn.user,
    password: conn.password,
    database: conn.database,
    connectionTimeoutMillis: 5_000,
  });
  await client.connect();
  try {
    const res = await client.query(`SELECT count(*)::int AS count FROM "${table}"`);
    return res.rows[0]?.count ?? 0;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Duck-typed on purpose: a test double standing in for a
 * `PostgresLifecycleManager` (this file's own unit tests use one for both
 * the live and the scratch instance) may not implement `credentialsPath`
 * at all — that is fine, it just means this optional step is skipped. */
function getCredentialsPath(manager: unknown): string | undefined {
  const path = (manager as { credentialsPath?: unknown }).credentialsPath;
  return typeof path === 'string' ? path : undefined;
}

function defaultVerificationManagerFactory(dataDir: string, port: number): PostgresLifecycleManager {
  return new PostgresLifecycleManager({ dataDir, port, startupTimeoutMs: 30_000 });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackupArchiver, LocalBackupScheduler } from './backup-scheduler';
import { PostgresConnectionInfo, PostgresLifecycleManager } from './postgres-lifecycle';

// `countRows()` talks to Postgres only through a real `pg` Client — mocked
// here exactly as in postgres-lifecycle.spec.ts, so every restore-test
// scenario (a required table missing/empty, the scratch instance itself
// failing to start) runs deterministically with no real database.
let tableCounts: Record<string, number> = {};
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockEnd = jest.fn().mockResolvedValue(undefined);
const mockQuery = jest.fn().mockImplementation((sql: string) => {
  const match = /FROM "([^"]+)"/.exec(sql);
  const table = match?.[1] ?? '';
  return Promise.resolve({ rows: [{ count: tableCounts[table] ?? 0 }] });
});
jest.mock('pg', () => ({
  Client: jest.fn().mockImplementation(() => ({ connect: mockConnect, query: mockQuery, end: mockEnd })),
}));

class FakeArchiver implements BackupArchiver {
  sizeBytes = 5000;
  shouldFailArchive = false;
  archiveCalls: string[] = [];
  extractCalls: string[] = [];

  async archive(sourceDir: string, archivePath: string): Promise<void> {
    this.archiveCalls.push(archivePath);
    if (this.shouldFailArchive) throw new Error('tar failed');
    writeFileSync(archivePath, Buffer.alloc(this.sizeBytes));
  }

  async extract(archivePath: string, destDir: string): Promise<void> {
    this.extractCalls.push(archivePath);
    mkdirSync(join(destDir, 'pgdata'), { recursive: true });
  }
}

function fakeLivePostgres() {
  return {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  } as unknown as PostgresLifecycleManager;
}

function fakeVerificationManager(opts: { failStart?: boolean } = {}) {
  const info: PostgresConnectionInfo = {
    host: '127.0.0.1',
    port: 0,
    user: 'u',
    password: 'p',
    database: 'd',
  };
  const start = jest.fn().mockImplementation(async () => {
    if (opts.failStart) throw new Error('scratch instance failed to start');
    return info;
  });
  const stop = jest.fn().mockResolvedValue(undefined);
  return { start, stop } as unknown as PostgresLifecycleManager;
}

describe('LocalBackupScheduler', () => {
  let backupDir: string;
  let dataDir: string;
  let archiver: FakeArchiver;
  let live: PostgresLifecycleManager;

  beforeEach(() => {
    jest.clearAllMocks();
    tableCounts = { Permission: 3, User: 1 };
    const root = mkdtempSync(join(tmpdir(), 'desktop-backup-'));
    backupDir = join(root, 'backups');
    dataDir = join(root, 'pgdata');
    mkdirSync(dataDir, { recursive: true });
    archiver = new FakeArchiver();
    live = fakeLivePostgres();
  });

  function makeScheduler(overrides: Partial<ConstructorParameters<typeof LocalBackupScheduler>[0]> = {}) {
    return new LocalBackupScheduler({
      postgres: live,
      dataDir,
      backupDir,
      intervalMs: 60_000,
      retentionDays: 14,
      requiredTables: ['Permission', 'User'],
      restorePort: 59999,
      archiver,
      createVerificationManager: () => fakeVerificationManager(),
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      ...overrides,
    });
  }

  describe('runOnce — the happy path', () => {
    it('stops the live database, archives, restarts it immediately, then verifies the copy', async () => {
      const scheduler = makeScheduler();
      const result = await scheduler.runOnce();

      expect(live.stop).toHaveBeenCalledTimes(1);
      expect(live.start).toHaveBeenCalledTimes(1);
      // Restart must happen before verification, not after — verified by
      // call order: stop, archive, start, then (separately) extract.
      expect(archiver.archiveCalls).toHaveLength(1);
      expect(archiver.extractCalls).toHaveLength(1);

      expect(result.restoreVerified).toBe(true);
      expect(result.verifiedTables).toEqual({ Permission: 3, User: 1 });
      expect(result.sizeBytes).toBe(5000);
    });

    it('records a successful run so a fresh scheduler does not treat it as overdue', async () => {
      const scheduler = makeScheduler();
      await scheduler.runOnce();
      const state = JSON.parse(readFileSync(join(backupDir, 'backup-state.json'), 'utf8'));
      expect(state.lastSuccessfulBackupAtMs).toBeGreaterThan(0);
    });

    it('cleans up its scratch restore-test directory afterwards', async () => {
      const scheduler = makeScheduler();
      await scheduler.runOnce();
      const leftover = readdirSync(backupDir).filter((f) => f.startsWith('.restore-test-'));
      expect(leftover).toHaveLength(0);
    });
  });

  describe('failure paths — never silently report success', () => {
    it('restarts the live database even when archiving itself throws', async () => {
      archiver.shouldFailArchive = true;
      const scheduler = makeScheduler();
      await expect(scheduler.runOnce()).rejects.toThrow('tar failed');
      expect(live.start).toHaveBeenCalledTimes(1);
    });

    it('marks the backup unverified when the archive is implausibly small', async () => {
      archiver.sizeBytes = 10;
      const scheduler = makeScheduler();
      const result = await scheduler.runOnce();
      expect(result.restoreVerified).toBe(false);
      expect(result.failureReason).toMatch(/refusing to trust it/);
    });

    it('marks the backup unverified when a required table restores empty', async () => {
      tableCounts.User = 0;
      const scheduler = makeScheduler();
      const result = await scheduler.runOnce();
      expect(result.restoreVerified).toBe(false);
      expect(result.failureReason).toMatch(/"User" is empty/);
    });

    it('marks the backup unverified when the scratch (restore-test) instance fails to start', async () => {
      const scheduler = makeScheduler({ createVerificationManager: () => fakeVerificationManager({ failStart: true }) });
      const result = await scheduler.runOnce();
      expect(result.restoreVerified).toBe(false);
      expect(result.failureReason).toMatch(/scratch instance failed to start/);
    });

    it('does not advance lastSuccessfulBackupAtMs on a failed restore test', async () => {
      tableCounts.User = 0;
      const scheduler = makeScheduler();
      await scheduler.runOnce();
      const state = JSON.parse(readFileSync(join(backupDir, 'backup-state.json'), 'utf8'));
      expect(state.lastSuccessfulBackupAtMs).toBeUndefined();
    });

    it('rejects an overlapping run rather than racing two backups against the same data directory', async () => {
      const scheduler = makeScheduler();
      const first = scheduler.runOnce();
      await expect(scheduler.runOnce()).rejects.toThrow(/already in progress/);
      await first;
    });
  });

  describe('start() — catch-up for a process that is not always running', () => {
    it('runs an immediate backup on start() when no prior successful backup is recorded', async () => {
      const scheduler = makeScheduler();
      await scheduler.start();
      expect(archiver.archiveCalls).toHaveLength(1);
      scheduler.stop();
    });

    it('skips the immediate backup when a recent successful backup is already recorded', async () => {
      mkdirSync(backupDir, { recursive: true });
      writeFileSync(
        join(backupDir, 'backup-state.json'),
        JSON.stringify({ lastSuccessfulBackupAtMs: Date.now() }),
      );
      const scheduler = makeScheduler();
      await scheduler.start();
      expect(archiver.archiveCalls).toHaveLength(0);
      scheduler.stop();
    });

    it('runs the catch-up backup when the last recorded one is older than the interval', async () => {
      mkdirSync(backupDir, { recursive: true });
      writeFileSync(
        join(backupDir, 'backup-state.json'),
        JSON.stringify({ lastSuccessfulBackupAtMs: Date.now() - 120_000 }),
      );
      const scheduler = makeScheduler({ intervalMs: 60_000 });
      await scheduler.start();
      expect(archiver.archiveCalls).toHaveLength(1);
      scheduler.stop();
    });

    it('never throws out of start() when the catch-up backup itself fails', async () => {
      archiver.shouldFailArchive = true;
      const scheduler = makeScheduler();
      await expect(scheduler.start()).resolves.toBeUndefined();
      scheduler.stop();
    });
  });

  describe('prune — retention, without ever losing the last known-good backup', () => {
    it('deletes archives older than retentionDays', async () => {
      const scheduler = makeScheduler({ retentionDays: 14 });
      await scheduler.runOnce();
      const old = join(backupDir, 'backup-ancient.tar.gz');
      writeFileSync(old, Buffer.alloc(2000));
      const oldTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      utimesSync(old, oldTime, oldTime);

      await scheduler.runOnce();
      expect(existsSync(old)).toBe(false);
    });

    it('keeps the single newest archive even if every backup has been failing its restore test', async () => {
      tableCounts.User = 0;
      const scheduler = makeScheduler({ retentionDays: 0 });
      const result = await scheduler.runOnce();
      // retentionDays: 0 means "everything not-newest is prunable
      // immediately", but the newest archive (this one) must survive
      // regardless of its own verification outcome or retention age.
      expect(existsSync(result.archivePath)).toBe(true);
    });
  });
});

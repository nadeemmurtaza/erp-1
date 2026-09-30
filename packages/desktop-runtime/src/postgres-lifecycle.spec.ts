import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PostgresConnectionInfo,
  PostgresCredentialStore,
  PostgresLifecycleError,
  PostgresLifecycleManager,
  PostgresRunner,
} from './postgres-lifecycle';

// The manager talks to Postgres only through `checkOnce()`'s internal `pg`
// client — mocked here so every scenario below (including "health check
// never succeeds") runs in milliseconds with no real database, matching
// this repository's own "external service failure" testing-standard
// scenario without needing root or a multi-second real Postgres boot
// (see postgres-lifecycle.integration.spec.ts for that).
const mockConnect = jest.fn();
const mockQuery = jest.fn();
const mockEnd = jest.fn();
const clientConfigs: Array<{ database: string }> = [];
jest.mock('pg', () => ({
  Client: jest.fn().mockImplementation((config: { database: string }) => {
    clientConfigs.push(config);
    return { connect: mockConnect, query: mockQuery, end: mockEnd };
  }),
}));

function healthy() {
  mockConnect.mockResolvedValue(undefined);
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('pg_database')) return Promise.resolve({ rows: [], rowCount: 0 });
    return Promise.resolve({ rows: [{ '?column?': 1 }], rowCount: 1 });
  });
  mockEnd.mockResolvedValue(undefined);
}

function neverHealthy() {
  mockConnect.mockRejectedValue(new Error('ECONNREFUSED'));
  mockEnd.mockResolvedValue(undefined);
}

class FakePostgresRunner implements PostgresRunner {
  initialiseCalls = 0;
  startCalls = 0;
  stopCalls = 0;
  initialiseError: Error | undefined;
  startError: Error | undefined;
  stopError: Error | undefined;

  constructor(private readonly dataDir: string) {}

  async initialise(): Promise<void> {
    this.initialiseCalls++;
    if (this.initialiseError) throw this.initialiseError;
    // Real Postgres marks an initialised data directory with a
    // `PG_VERSION` file — reproduced here so `ensureInitialised()`'s
    // "skip a second initdb" branch is exercised for real, the same way
    // it would be against the real binary.
    writeFileSync(join(this.dataDir, 'PG_VERSION'), '18\n');
  }

  async start(): Promise<void> {
    this.startCalls++;
    if (this.startError) throw this.startError;
  }

  async stop(): Promise<void> {
    this.stopCalls++;
    if (this.stopError) throw this.stopError;
  }
}

describe('PostgresLifecycleManager', () => {
  // Each test gets its own root directory, with `dataDir` one level
  // inside it — the credentials file lives at `dataDir/../…`, so it must
  // land inside this test's own unique root rather than being shared
  // (and silently reused) across every test in this file via the OS temp
  // directory itself.
  let root: string;
  let dataDir: string;
  let runner: FakePostgresRunner;

  beforeEach(() => {
    jest.clearAllMocks();
    clientConfigs.length = 0;
    root = mkdtempSync(join(tmpdir(), 'desktop-pg-'));
    dataDir = join(root, 'pgdata');
    mkdirSync(dataDir, { recursive: true });
    runner = new FakePostgresRunner(dataDir);
    healthy();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function makeManager() {
    return new PostgresLifecycleManager({
      dataDir,
      port: 55555,
      startupTimeoutMs: 500,
      createRunner: () => runner,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });
  }

  describe('credentials — never a shared default', () => {
    it('generates a random credential pair on first use, persisted for reuse', () => {
      const store = new PostgresCredentialStore(join(dataDir, 'creds.json'));
      const first = store.loadOrCreate();
      const second = store.loadOrCreate();
      expect(first).toEqual(second);
      expect(first.password.length).toBeGreaterThan(20);
    });

    it('never generates the same password for two different installs', () => {
      const a = new PostgresCredentialStore(join(dataDir, 'a.json')).loadOrCreate();
      const b = new PostgresCredentialStore(join(dataDir, 'b.json')).loadOrCreate();
      expect(a.password).not.toEqual(b.password);
    });

    it('writes the credentials file owner-only (0o600)', () => {
      const path = join(dataDir, 'perm.json');
      new PostgresCredentialStore(path).loadOrCreate();
      const mode = statSync(path).mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  describe('ensureInitialised', () => {
    it('calls initdb exactly once on a fresh data directory', async () => {
      const manager = makeManager();
      await manager.ensureInitialised();
      expect(runner.initialiseCalls).toBe(1);
    });

    it('is a no-op when the data directory already has PG_VERSION (never re-runs initdb against live data)', async () => {
      writeFileSync(join(dataDir, 'PG_VERSION'), '18\n');
      const manager = makeManager();
      await manager.ensureInitialised();
      expect(runner.initialiseCalls).toBe(0);
    });

    it('wraps an initdb failure as INIT_FAILED with a REINSTALL repair action', async () => {
      runner.initialiseError = new Error('permission denied');
      const manager = makeManager();
      await expect(manager.ensureInitialised()).rejects.toMatchObject({
        code: 'INIT_FAILED',
        repairAction: 'REINSTALL',
      });
    });
  });

  describe('start', () => {
    it('initialises, starts, and health-checks before resolving', async () => {
      const manager = makeManager();
      const info: PostgresConnectionInfo = await manager.start();
      expect(runner.initialiseCalls).toBe(1);
      expect(runner.startCalls).toBe(1);
      expect(info.port).toBe(55555);
      expect(manager.isRunning()).toBe(true);
    });

    it('is idempotent — a second start() does not re-launch an already-running instance or re-run initdb', async () => {
      const manager = makeManager();
      await manager.start();
      await manager.start();
      expect(runner.startCalls).toBe(1);
      expect(runner.initialiseCalls).toBe(1);
    });

    it('wraps a launch failure as START_FAILED with a RETRY repair action', async () => {
      runner.startError = new Error('address already in use');
      const manager = makeManager();
      await expect(manager.start()).rejects.toBeInstanceOf(PostgresLifecycleError);
      await expect(manager.start()).rejects.toMatchObject({
        code: 'START_FAILED',
        repairAction: 'RETRY',
      });
    });

    it('wraps a health check that never succeeds as HEALTH_CHECK_FAILED with a RESTORE_FROM_BACKUP repair action', async () => {
      neverHealthy();
      const manager = makeManager();
      await expect(manager.start()).rejects.toMatchObject({
        code: 'HEALTH_CHECK_FAILED',
        repairAction: 'RESTORE_FROM_BACKUP',
      });
      // The process itself did launch — only the health probe failed —
      // so isRunning() must stay false: nothing downstream may treat an
      // unhealthy instance as ready.
      expect(manager.isRunning()).toBe(false);
    });

    it('recovers once the database becomes healthy on a later poll (transient startup delay, not a failure)', async () => {
      let attempts = 0;
      mockConnect.mockImplementation(() => {
        attempts++;
        return attempts < 2 ? Promise.reject(new Error('starting up')) : Promise.resolve();
      });
      mockQuery.mockResolvedValue({ rows: [] });
      mockEnd.mockResolvedValue(undefined);
      const manager = makeManager();
      await expect(manager.start()).resolves.toBeDefined();
    });
  });

  describe('start — database bootstrap (initdb never creates the application database)', () => {
    it('checks server readiness against the always-present "postgres" maintenance database, not the target database', async () => {
      const manager = makeManager();
      await manager.start();
      // The very first client this manager opens is the readiness poll —
      // against "postgres", since the target database does not exist yet
      // immediately after initdb.
      expect(clientConfigs[0].database).toBe('postgres');
    });

    it('creates the target database when pg_database reports it missing', async () => {
      const manager = makeManager();
      await manager.start();
      const createCalls = mockQuery.mock.calls.filter(([sql]) => /CREATE DATABASE/.test(sql));
      expect(createCalls).toHaveLength(1);
      expect(createCalls[0][0]).toContain('"newax_desktop"');
    });

    it('does not re-create the target database when pg_database already reports it present', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('pg_database')) return Promise.resolve({ rows: [{ datname: 'newax_desktop' }], rowCount: 1 });
        return Promise.resolve({ rows: [{ '?column?': 1 }], rowCount: 1 });
      });
      const manager = makeManager();
      await manager.start();
      const createCalls = mockQuery.mock.calls.filter(([sql]) => /CREATE DATABASE/.test(sql));
      expect(createCalls).toHaveLength(0);
    });

    it('runs a final check against the real target database after ensuring it exists', async () => {
      const manager = makeManager();
      await manager.start();
      const targetDatabaseConfigs = clientConfigs.filter((c) => c.database === 'newax_desktop');
      expect(targetDatabaseConfigs.length).toBeGreaterThanOrEqual(1);
    });

    it('fails with HEALTH_CHECK_FAILED when the database exists check itself fails', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('pg_database')) return Promise.reject(new Error('permission denied for table pg_database'));
        return Promise.resolve({ rows: [{ '?column?': 1 }], rowCount: 1 });
      });
      const manager = makeManager();
      await expect(manager.start()).rejects.toMatchObject({ code: 'HEALTH_CHECK_FAILED' });
    });
  });

  describe('isHealthy', () => {
    it('reports true when the health probe succeeds', async () => {
      const manager = makeManager();
      await expect(manager.isHealthy()).resolves.toBe(true);
    });

    it('reports false, never throws, when the health probe fails', async () => {
      neverHealthy();
      const manager = makeManager();
      await expect(manager.isHealthy()).resolves.toBe(false);
    });
  });

  describe('stop', () => {
    it('is a no-op when nothing is running', async () => {
      const manager = makeManager();
      await manager.stop();
      expect(runner.stopCalls).toBe(0);
    });

    it('stops a running instance and flips isRunning() to false', async () => {
      const manager = makeManager();
      await manager.start();
      await manager.stop();
      expect(runner.stopCalls).toBe(1);
      expect(manager.isRunning()).toBe(false);
    });

    it('wraps a shutdown failure as STOP_FAILED with a RETRY repair action', async () => {
      const manager = makeManager();
      await manager.start();
      runner.stopError = new Error('signal ignored');
      await expect(manager.stop()).rejects.toMatchObject({
        code: 'STOP_FAILED',
        repairAction: 'RETRY',
      });
    });
  });

  it('never falls back to a shared/default password even when nothing has generated one yet', () => {
    expect(existsSync(join(dataDir, '..', 'desktop-node.credentials.json'))).toBe(false);
    const manager = makeManager();
    const info = manager.connectionInfo;
    expect(info.password).not.toBe('postgres');
    expect(info.password).not.toBe('');
    expect(info.password.length).toBeGreaterThan(20);
  });
});

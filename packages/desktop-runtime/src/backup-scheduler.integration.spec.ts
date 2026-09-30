import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { LocalBackupScheduler, TarBackupArchiver } from './backup-scheduler';
import { PostgresLifecycleManager } from './postgres-lifecycle';

/**
 * Two real-mechanism checks, split by what this sandbox can actually
 * prove (see `postgres-lifecycle.integration.spec.ts` for the same
 * root/Postgres constraint, explained once there rather than repeated
 * here):
 *
 * 1. `TarBackupArchiver` round-tripping real files through the real `tar`
 *    npm package — no Postgres involved, so it runs regardless of the
 *    root constraint, and proves the one piece of WO-48.5 that a unit
 *    test's fake archiver cannot.
 * 2. The full `LocalBackupScheduler` pipeline against a real embedded
 *    Postgres instance — skipped under root for the same reason
 *    `postgres-lifecycle.integration.spec.ts` skips, since it drives the
 *    same `PostgresLifecycleManager`.
 */
describe('TarBackupArchiver (real tar package, no Postgres)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'desktop-tar-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('archives a directory tree and extracts it back byte-for-byte', async () => {
    const sourceDir = join(root, 'pgdata');
    mkdirSync(join(sourceDir, 'base'), { recursive: true });
    writeFileSync(join(sourceDir, 'PG_VERSION'), '18\n');
    writeFileSync(join(sourceDir, 'base', 'some-table-file'), 'not real postgres data, just bytes');

    const archiver = new TarBackupArchiver();
    const archivePath = join(root, 'archive.tar.gz');
    await archiver.archive(sourceDir, archivePath);
    expect(existsSync(archivePath)).toBe(true);

    const destDir = join(root, 'restored');
    await archiver.extract(archivePath, destDir);

    expect(readFileSync(join(destDir, 'pgdata', 'PG_VERSION'), 'utf8')).toBe('18\n');
    expect(readFileSync(join(destDir, 'pgdata', 'base', 'some-table-file'), 'utf8')).toBe(
      'not real postgres data, just bytes',
    );
  });
});

const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const describeIfNotRoot = isRoot ? describe.skip : describe;

if (isRoot) {
  console.warn(
    '[backup-scheduler.integration.spec] SKIPPED: same root/Postgres constraint as ' +
      'postgres-lifecycle.integration.spec.ts — this suite drives a real PostgresLifecycleManager.',
  );
}

describeIfNotRoot('LocalBackupScheduler (real embedded Postgres + real tar)', () => {
  jest.setTimeout(90_000);
  let root: string;
  let postgres: PostgresLifecycleManager;
  let dataDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'desktop-backup-real-'));
    dataDir = join(root, 'pgdata');
    postgres = new PostgresLifecycleManager({
      dataDir,
      port: 55931,
      startupTimeoutMs: 20_000,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });
  });

  afterEach(async () => {
    await postgres.stop().catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  });

  it('backs up a real database, restores it into a scratch instance, and verifies real data survived', async () => {
    const conn = await postgres.start();
    const client = new Client({
      host: conn.host,
      port: conn.port,
      user: conn.user,
      password: conn.password,
      database: conn.database,
    });
    await client.connect();
    await client.query('CREATE TABLE "Permission" (id serial primary key, name text)');
    await client.query("INSERT INTO \"Permission\" (name) VALUES ('orders.manage')");
    await client.end();

    const scheduler = new LocalBackupScheduler({
      postgres,
      dataDir,
      backupDir: join(root, 'backups'),
      intervalMs: 3_600_000,
      retentionDays: 14,
      requiredTables: ['Permission'],
      restorePort: 55932,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });

    const result = await scheduler.runOnce();
    expect(result.restoreVerified).toBe(true);
    expect(result.verifiedTables.Permission).toBe(1);

    // The live instance must have come back up, with the same data,
    // after being stopped for the file copy.
    await expect(postgres.isHealthy()).resolves.toBe(true);
  });
});

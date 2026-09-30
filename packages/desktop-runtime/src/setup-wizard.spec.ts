import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FirstRunSetupWizard,
  MigrationRunner,
  NodeConfig,
  SetupWizardError,
  validateNodeConfig,
} from './setup-wizard';
import { PostgresConnectionInfo, PostgresLifecycleManager } from './postgres-lifecycle';

function baseConfig(overrides: Partial<NodeConfig> = {}): NodeConfig {
  return {
    nodeRole: 'STANDALONE',
    nodeId: 'main',
    redisUrl: 'redis://127.0.0.1:6379',
    ...overrides,
  };
}

describe('validateNodeConfig — mirrors env.validation.ts exactly', () => {
  it('accepts STANDALONE with no parent', () => {
    expect(() => validateNodeConfig(baseConfig())).not.toThrow();
  });

  it('rejects BRANCH with no PARENT_URL', () => {
    expect(() => validateNodeConfig(baseConfig({ nodeRole: 'BRANCH' }))).toThrow(
      /NODE_ROLE=BRANCH requires PARENT_URL/,
    );
  });

  it('accepts BRANCH with PARENT_URL and PARENT_API_KEY', () => {
    expect(() =>
      validateNodeConfig(
        baseConfig({ nodeRole: 'BRANCH', parentUrl: 'https://brand.example', parentApiKey: 'key' }),
      ),
    ).not.toThrow();
  });

  it.each(['ORG', 'STANDALONE'] as const)('rejects %s with a PARENT_URL set', (nodeRole) => {
    expect(() =>
      validateNodeConfig(baseConfig({ nodeRole, parentUrl: 'https://x.example', parentApiKey: 'k' })),
    ).toThrow(new RegExp(`NODE_ROLE=${nodeRole} does not take a PARENT_URL`));
  });

  it('accepts BRAND with no PARENT_URL (a Chain-edition brand has no organization above it)', () => {
    expect(() => validateNodeConfig(baseConfig({ nodeRole: 'BRAND' }))).not.toThrow();
  });

  it('rejects PARENT_URL without PARENT_API_KEY', () => {
    expect(() =>
      validateNodeConfig(baseConfig({ nodeRole: 'BRANCH', parentUrl: 'https://x.example' })),
    ).toThrow(/PARENT_API_KEY is not/);
  });

  it('rejects PARENT_API_KEY without PARENT_URL', () => {
    expect(() => validateNodeConfig(baseConfig({ parentApiKey: 'key-with-no-url' }))).toThrow(
      /PARENT_URL is not/,
    );
  });

  it('rejects a missing REDIS_URL rather than silently defaulting to localhost', () => {
    expect(() => validateNodeConfig(baseConfig({ redisUrl: '' }))).toThrow(/REDIS_URL is required/);
  });
});

describe('FirstRunSetupWizard', () => {
  let root: string;
  let postgres: PostgresLifecycleManager;
  let migrationRunner: MigrationRunner & { migrateCalls: NodeJS.ProcessEnv[]; seedCalls: NodeJS.ProcessEnv[] };
  const fakeConnectionInfo: PostgresConnectionInfo = {
    host: '127.0.0.1',
    port: 55999,
    user: 'desktop_node',
    password: 'super-secret',
    database: 'newax_desktop',
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'desktop-wizard-'));
    postgres = { start: jest.fn().mockResolvedValue(fakeConnectionInfo) } as unknown as PostgresLifecycleManager;
    migrationRunner = {
      migrateCalls: [],
      seedCalls: [],
      async migrate(env) {
        this.migrateCalls.push(env);
      },
      async seed(env) {
        this.seedCalls.push(env);
      },
    };
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function makeWizard(overrides: Partial<ConstructorParameters<typeof FirstRunSetupWizard>[0]> = {}) {
    return new FirstRunSetupWizard({
      postgres,
      apiDir: root,
      envFilePath: join(root, 'apps-api.env'),
      completionMarkerPath: join(root, '.setup-complete'),
      migrationRunner,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      ...overrides,
    });
  }

  it('reports isFirstRun() true before any run, false after a successful one', async () => {
    const wizard = makeWizard();
    expect(wizard.isFirstRun()).toBe(true);
    await wizard.run(baseConfig());
    expect(wizard.isFirstRun()).toBe(false);
  });

  it('never touches Postgres, migrations, or disk for an invalid config', async () => {
    const wizard = makeWizard();
    await expect(wizard.run(baseConfig({ nodeRole: 'BRANCH' }))).rejects.toThrow(SetupWizardError);
    expect(postgres.start).not.toHaveBeenCalled();
    expect(migrationRunner.migrateCalls).toHaveLength(0);
    expect(existsSync(join(root, '.setup-complete'))).toBe(false);
  });

  it('runs Postgres start, migrate, seed, and writes the env file, in that order, reporting each step', async () => {
    const progress: string[] = [];
    const wizard = makeWizard({ onProgress: (r) => progress.push(`${r.step}:${r.status}`) });

    const result = await wizard.run(baseConfig());

    expect(result.alreadyCompleted).toBe(false);
    expect(postgres.start).toHaveBeenCalledTimes(1);
    expect(migrationRunner.migrateCalls).toHaveLength(1);
    expect(migrationRunner.seedCalls).toHaveLength(1);
    expect(progress).toEqual([
      'START_POSTGRES:RUNNING',
      'START_POSTGRES:SUCCEEDED',
      'RUN_MIGRATIONS:RUNNING',
      'RUN_MIGRATIONS:SUCCEEDED',
      'RUN_SEED:RUNNING',
      'RUN_SEED:SUCCEEDED',
      'WRITE_NODE_CONFIG:RUNNING',
      'WRITE_NODE_CONFIG:SUCCEEDED',
    ]);
  });

  it('passes DATABASE_URL built from the real Postgres connection info to migrate() and seed()', async () => {
    const wizard = makeWizard();
    await wizard.run(baseConfig());
    const migrateEnv = migrationRunner.migrateCalls[0];
    expect(migrateEnv.DATABASE_URL).toBe(
      `postgresql://desktop_node:super-secret@127.0.0.1:55999/newax_desktop`,
    );
    expect(migrationRunner.seedCalls[0].DATABASE_URL).toBe(migrateEnv.DATABASE_URL);
  });

  it('generates a fresh random JWT/encryption secret per run, never a shared default', async () => {
    const wizard = makeWizard();
    await wizard.run(baseConfig());
    const env = migrationRunner.migrateCalls[0];
    expect(env.JWT_ACCESS_SECRET).toBeDefined();
    expect(env.JWT_ACCESS_SECRET!.length).toBeGreaterThanOrEqual(32);
    expect(env.JWT_ACCESS_SECRET).not.toBe(env.JWT_REFRESH_SECRET);
    expect(Buffer.from(env.APP_ENCRYPTION_KEY!, 'utf8').length).toBe(32);
  });

  it('is idempotent: a second run() on an already-completed install is a no-op', async () => {
    const wizard = makeWizard();
    await wizard.run(baseConfig());
    const second = await wizard.run(baseConfig());
    expect(second.alreadyCompleted).toBe(true);
    expect(postgres.start).toHaveBeenCalledTimes(1);
    expect(migrationRunner.migrateCalls).toHaveLength(1);
  });

  it('surfaces a readable, step-labelled error when Postgres fails to start, and reports FAILED', async () => {
    (postgres.start as jest.Mock).mockRejectedValue(new Error('port in use'));
    const progress: string[] = [];
    const wizard = makeWizard({ onProgress: (r) => progress.push(`${r.step}:${r.status}`) });

    await expect(wizard.run(baseConfig())).rejects.toMatchObject({ step: 'START_POSTGRES' });
    expect(progress).toEqual(['START_POSTGRES:RUNNING', 'START_POSTGRES:FAILED']);
    // A failed run must not be marked complete — the next launch retries
    // from the top rather than believing an install that never finished.
    expect(existsSync(join(root, '.setup-complete'))).toBe(false);
  });

  it('surfaces a readable, step-labelled error when migration fails, without running seed', async () => {
    migrationRunner.migrate = async () => {
      throw new Error('relation already exists');
    };
    const wizard = makeWizard();
    await expect(wizard.run(baseConfig())).rejects.toMatchObject({ step: 'RUN_MIGRATIONS' });
    expect(migrationRunner.seedCalls).toHaveLength(0);
  });

  it('surfaces a readable, step-labelled error when seed fails, after migrations already succeeded', async () => {
    migrationRunner.seed = async () => {
      throw new Error('seed script crashed');
    };
    const wizard = makeWizard();
    await expect(wizard.run(baseConfig())).rejects.toMatchObject({ step: 'RUN_SEED' });
    expect(migrationRunner.migrateCalls).toHaveLength(1);
    expect(existsSync(join(root, '.setup-complete'))).toBe(false);
  });

  it('writes the env file owner-only (0o600) and never logs its contents', async () => {
    const infoSpy = jest.fn();
    const wizard = makeWizard({ logger: { info: infoSpy, warn: jest.fn(), error: jest.fn() } });
    await wizard.run(baseConfig({ parentUrl: undefined, parentApiKey: undefined }));

    const envPath = join(root, 'apps-api.env');
    const mode = statSync(envPath).mode & 0o777;
    expect(mode).toBe(0o600);

    const written = readFileSync(envPath, 'utf8');
    expect(written).toContain('DATABASE_URL=');
    expect(written).toContain('NODE_ROLE=STANDALONE');

    for (const call of infoSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('super-secret');
    }
  });

  it('omits PARENT_URL/PARENT_API_KEY from the env file for a STANDALONE node', async () => {
    const wizard = makeWizard();
    await wizard.run(baseConfig());
    const written = readFileSync(join(root, 'apps-api.env'), 'utf8');
    expect(written).not.toContain('PARENT_URL=');
    expect(written).not.toContain('PARENT_API_KEY=');
  });

  it('includes PARENT_URL/PARENT_API_KEY for a BRANCH node', async () => {
    const wizard = makeWizard();
    await wizard.run(
      baseConfig({ nodeRole: 'BRANCH', parentUrl: 'https://brand.example', parentApiKey: 'the-key' }),
    );
    const written = readFileSync(join(root, 'apps-api.env'), 'utf8');
    expect(written).toContain('PARENT_URL=https://brand.example');
    expect(written).toContain('PARENT_API_KEY=the-key');
  });
});

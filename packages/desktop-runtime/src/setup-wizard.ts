import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { PostgresConnectionInfo, PostgresLifecycleManager } from './postgres-lifecycle';
import { DesktopLogger, consoleDesktopLogger } from './logger';

/**
 * 48-native-desktop-deployment.md WO-48.3 — the first-run setup wizard, as
 * real, testable orchestration, not a terminal script.
 *
 * "A wizard that runs the equivalent of `db:migrate deploy` + `db:seed`
 * once, locally, on first launch — never requiring a terminal" (doc 48
 * §2). This class is that wizard's actual logic: a future GUI (whatever
 * shell WO-48.2 eventually picks) presents a form and calls `run()` with
 * the answers, watching `onProgress` to render a progress screen — no
 * terminal, no shell prompt, anywhere in this file.
 */

export type NodeRole = 'STANDALONE' | 'BRANCH' | 'BRAND' | 'ORG';

export interface NodeConfig {
  nodeRole: NodeRole;
  /** Unique per deployment — `env.validation.ts`'s own `NODE_ID`. */
  nodeId: string;
  parentUrl?: string;
  parentApiKey?: string;
  /**
   * This document's own build surfaced a real gap `48-native-desktop-
   * deployment.md` does not name: `env.validation.ts` requires `REDIS_URL`
   * outside a bare default in production, and doc 48 embeds a managed
   * Postgres but never a managed Redis. Rather than silently default this
   * to `localhost:6379` (which nothing on a fresh install is listening
   * on) or silently force `NODE_ENV=development` to dodge the production
   * checks, the wizard asks for it explicitly — see this package's own
   * top-level README section in the status blockquote of doc 48 for the
   * follow-up this names but does not solve (an embedded local Redis, or
   * a documented decision to run the desktop node with the modules that
   * need Redis disabled).
   */
  redisUrl: string;
}

/** Mirrors `apps/api/src/core/config/env.validation.ts`'s NODE_ROLE /
 * PARENT_URL / PARENT_API_KEY rules verbatim — deliberately duplicated,
 * not imported, because `apps/api` is a deployed Nest application, not a
 * library another workspace package depends on. If either file's rule
 * changes, the other must change with it; this comment is the pointer
 * that makes that findable instead of silently drifting. Validating here,
 * before any file is written or any process spawned, is what makes "the
 * wizard can never hand `apps/api` a combination it will refuse to boot
 * with" true rather than hoped. */
export function validateNodeConfig(config: NodeConfig): void {
  if (config.nodeRole === 'BRANCH' && !config.parentUrl) {
    throw new SetupWizardError(
      'VALIDATE_CONFIG',
      'NODE_ROLE=BRANCH requires PARENT_URL — a branch always replicates to its brand.',
    );
  }
  if ((config.nodeRole === 'ORG' || config.nodeRole === 'STANDALONE') && config.parentUrl) {
    throw new SetupWizardError(
      'VALIDATE_CONFIG',
      `NODE_ROLE=${config.nodeRole} does not take a PARENT_URL — it is the top of its topology.`,
    );
  }
  if (config.parentUrl && !config.parentApiKey) {
    throw new SetupWizardError(
      'VALIDATE_CONFIG',
      'PARENT_URL is set but PARENT_API_KEY is not — this node cannot authenticate to its parent.',
    );
  }
  if (config.parentApiKey && !config.parentUrl) {
    throw new SetupWizardError(
      'VALIDATE_CONFIG',
      'PARENT_API_KEY is set but PARENT_URL is not — there is nothing to call with it.',
    );
  }
  if (!config.redisUrl) {
    throw new SetupWizardError('VALIDATE_CONFIG', 'REDIS_URL is required — see NodeConfig.redisUrl\'s own comment.');
  }
}

export type WizardStepName =
  | 'START_POSTGRES'
  | 'RUN_MIGRATIONS'
  | 'RUN_SEED'
  | 'WRITE_NODE_CONFIG';

export interface WizardStepResult {
  step: WizardStepName;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  error?: string;
}

export class SetupWizardError extends Error {
  constructor(
    readonly step: WizardStepName | 'VALIDATE_CONFIG',
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SetupWizardError';
  }
}

export interface WizardResult {
  alreadyCompleted: boolean;
  steps: WizardStepResult[];
}

/** The seam over `prisma migrate deploy` / `db:seed` — real by default
 * (`DefaultMigrationRunner`, shelling out exactly as `apps/api`'s own
 * `pnpm db:deploy` / `pnpm db:seed` scripts do), fake in tests so the
 * wizard's own step ordering and error handling can be proven without a
 * live database or a real multi-second migration run on every test. */
export interface MigrationRunner {
  migrate(env: NodeJS.ProcessEnv): Promise<void>;
  seed(env: NodeJS.ProcessEnv): Promise<void>;
}

/** Shells out inside `apps/api`'s own package directory, using the exact
 * scripts `apps/api/package.json` already exposes (`db:deploy` →
 * `prisma migrate deploy`, `db:seed` → `ts-node …/seed.ts`) — this file
 * never re-implements a migration runner, it drives the one that
 * already exists and is already forward-only per `00-HOUSE-RULES.md`. */
export class DefaultMigrationRunner implements MigrationRunner {
  constructor(private readonly apiDir: string) {}

  migrate(env: NodeJS.ProcessEnv): Promise<void> {
    return runCommand('pnpm', ['run', 'db:deploy'], this.apiDir, env);
  }

  seed(env: NodeJS.ProcessEnv): Promise<void> {
    return runCommand('pnpm', ['run', 'db:seed'], this.apiDir, env);
  }
}

function runCommand(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}${stderr ? `: ${stderr.slice(-2000)}` : ''}`));
    });
  });
}

export interface FirstRunSetupWizardOptions {
  postgres: PostgresLifecycleManager;
  /** The directory `apps/api` lives in, for `DefaultMigrationRunner`. */
  apiDir: string;
  /** Where the generated environment is written for `apps/api` to read
   * on its own next boot. */
  envFilePath: string;
  /** A marker file whose existence means "this install's first run has
   * already completed" — checked instead of re-deriving the answer from
   * database state, so a wizard interrupted mid-run (power loss, a
   * crashed shell) is retried from the top on next launch rather than
   * silently believed complete. */
  completionMarkerPath: string;
  migrationRunner?: MigrationRunner;
  onProgress?: (result: WizardStepResult) => void;
  logger?: DesktopLogger;
}

/**
 * "Reaches a working till within the setup wizard's own steps" (doc 48's
 * own acceptance criterion) means every step here either succeeds or
 * fails with a readable reason — nothing here throws an unlabelled error
 * a GUI would have to guess about.
 */
export class FirstRunSetupWizard {
  private readonly logger: DesktopLogger;
  private readonly migrationRunner: MigrationRunner;

  constructor(private readonly options: FirstRunSetupWizardOptions) {
    this.logger = options.logger ?? consoleDesktopLogger;
    this.migrationRunner = options.migrationRunner ?? new DefaultMigrationRunner(options.apiDir);
  }

  isFirstRun(): boolean {
    return !existsSync(this.options.completionMarkerPath);
  }

  async run(config: NodeConfig): Promise<WizardResult> {
    // Validated before any IO at all — a bad combination never starts
    // Postgres, never touches the filesystem, never spawns a process.
    validateNodeConfig(config);

    if (!this.isFirstRun()) {
      this.logger.info('First-run setup already completed — nothing to do');
      return { alreadyCompleted: true, steps: [] };
    }

    const steps: WizardStepResult[] = [];
    const report = (result: WizardStepResult) => {
      steps.push(result);
      this.options.onProgress?.(result);
    };

    let conn: PostgresConnectionInfo;
    try {
      report({ step: 'START_POSTGRES', status: 'RUNNING' });
      conn = await this.options.postgres.start();
      report({ step: 'START_POSTGRES', status: 'SUCCEEDED' });
    } catch (cause) {
      report({ step: 'START_POSTGRES', status: 'FAILED', error: describe(cause) });
      throw new SetupWizardError('START_POSTGRES', 'Could not start the local database.', cause);
    }

    const env = buildApiEnv(conn, config);

    try {
      report({ step: 'RUN_MIGRATIONS', status: 'RUNNING' });
      await this.migrationRunner.migrate(env);
      report({ step: 'RUN_MIGRATIONS', status: 'SUCCEEDED' });
    } catch (cause) {
      report({ step: 'RUN_MIGRATIONS', status: 'FAILED', error: describe(cause) });
      throw new SetupWizardError('RUN_MIGRATIONS', 'Could not set up the database schema.', cause);
    }

    try {
      report({ step: 'RUN_SEED', status: 'RUNNING' });
      await this.migrationRunner.seed(env);
      report({ step: 'RUN_SEED', status: 'SUCCEEDED' });
    } catch (cause) {
      report({ step: 'RUN_SEED', status: 'FAILED', error: describe(cause) });
      throw new SetupWizardError('RUN_SEED', 'Could not load the starting data.', cause);
    }

    try {
      report({ step: 'WRITE_NODE_CONFIG', status: 'RUNNING' });
      writeEnvFile(this.options.envFilePath, env);
      markComplete(this.options.completionMarkerPath);
      report({ step: 'WRITE_NODE_CONFIG', status: 'SUCCEEDED' });
    } catch (cause) {
      report({ step: 'WRITE_NODE_CONFIG', status: 'FAILED', error: describe(cause) });
      throw new SetupWizardError('WRITE_NODE_CONFIG', 'Could not save the node configuration.', cause);
    }

    this.logger.info('First-run setup complete');
    return { alreadyCompleted: false, steps };
  }
}

/**
 * The exact env vars `env.validation.ts` requires with no usable default
 * outside a developer's own machine: `DATABASE_URL` (from the Postgres
 * lifecycle manager's own generated credentials — never re-derived here),
 * `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `APP_ENCRYPTION_KEY`
 * (freshly random per install, the same "never a shared default"
 * discipline `PostgresCredentialStore` already applies), and the node
 * topology fields this wizard collected. Everything else `apps/api`
 * already defaults sanely (`MODULES`, `PAYMENT_PROVIDERS`, …) and is left
 * unset so a later upgrade's new default is picked up automatically
 * rather than pinned forever by this file.
 */
function buildApiEnv(conn: PostgresConnectionInfo, config: NodeConfig): NodeJS.ProcessEnv {
  const databaseUrl = `postgresql://${encodeURIComponent(conn.user)}:${encodeURIComponent(conn.password)}@${conn.host}:${conn.port}/${conn.database}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    REDIS_URL: config.redisUrl,
    JWT_ACCESS_SECRET: randomSecret(48),
    JWT_REFRESH_SECRET: randomSecret(48),
    APP_ENCRYPTION_KEY: randomBytes(32).toString('base64').slice(0, 32),
    NODE_ROLE: config.nodeRole,
    NODE_ID: config.nodeId,
  };
  if (config.parentUrl) env.PARENT_URL = config.parentUrl;
  if (config.parentApiKey) env.PARENT_API_KEY = config.parentApiKey;
  return env;
}

function randomSecret(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

/** Writes a plain `.env`-shaped file `apps/api` loads on its own next
 * boot. Never logged, never returned to a caller — only written to disk,
 * exactly once, owner-only. */
function writeEnvFile(path: string, env: NodeJS.ProcessEnv): void {
  const keys: Array<keyof typeof env> = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'APP_ENCRYPTION_KEY',
    'NODE_ROLE',
    'NODE_ID',
    'PARENT_URL',
    'PARENT_API_KEY',
  ];
  const lines = keys
    .filter((key) => env[key] !== undefined)
    .map((key) => `${key}=${env[key]}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${lines.join('\n')}\n`, { mode: 0o600 });
}

function markComplete(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, new Date().toISOString());
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

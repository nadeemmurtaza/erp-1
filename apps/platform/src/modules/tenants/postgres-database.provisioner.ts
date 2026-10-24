import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'pg';
import { AppConfigService } from '../../core/config/app-config.service';
import { DeploymentProvisioner, ProvisioningError } from './deployment-provisioner';

const execFileAsync = promisify(execFile);

/**
 * The real, working default implementation of `DeploymentProvisioner` —
 * doc 39 §"shared compute, never shared data" made concrete: every tenant
 * gets a genuinely separate Postgres database, created with `CREATE
 * DATABASE`, on the cluster this control plane's admin credential can
 * reach. This is deliberately NOT container/VM orchestration (doc 39
 * names that as the hosting operator's own concern) — it is the smallest
 * mechanism that actually satisfies "a tenant is a node with its own
 * database," buildable and testable without assuming any particular
 * container platform.
 *
 * A brand-new database has no tables. Applying the tenant application's
 * own schema is a second, explicit step — `prisma migrate deploy` against
 * the exact same migration history `apps/api`'s own `db:deploy` script
 * already uses, never a hand-rolled SQL replay that would leave Prisma's
 * own `_prisma_migrations` bookkeeping out of sync with reality.
 */
@Injectable()
export class PostgresDatabaseProvisioner implements DeploymentProvisioner {
  readonly name = 'postgres-database';
  private readonly logger = new Logger(PostgresDatabaseProvisioner.name);

  constructor(private readonly config: AppConfigService) {}

  private databaseNameFor(slug: string): string {
    // Slugs are already validated as [a-z0-9-]; Postgres identifiers don't
    // need hyphens escaped when unquoted only if they contain no hyphens,
    // so this stays a plain, unquoted, safe identifier either way.
    return `tenant_${slug.replace(/-/g, '_')}`;
  }

  private connectionStringFor(adminUrl: string, databaseName: string): string {
    const url = new URL(adminUrl);
    url.pathname = `/${databaseName}`;
    return url.toString();
  }

  async provision(input: { slug: string }): Promise<{ connectionString: string }> {
    const adminUrl = this.config.get('PLATFORM_PROVISIONING_ADMIN_URL');
    const databaseName = this.databaseNameFor(input.slug);

    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
      if (exists.rowCount === 0) {
        // CREATE DATABASE cannot take a parameterized identifier — the name
        // is our own generated, hyphen-free, lowercase-alphanumeric string
        // (never user-supplied SQL), so this is not an injection surface.
        await admin.query(`CREATE DATABASE "${databaseName}"`);
        this.logger.log(`Provisioned isolated database ${databaseName} for tenant ${input.slug}`);
      } else {
        this.logger.log(`Database ${databaseName} already exists for tenant ${input.slug} — idempotent no-op`);
      }
    } catch (error) {
      throw new ProvisioningError(`Failed to create database for tenant ${input.slug}`, error);
    } finally {
      await admin.end();
    }

    const connectionString = this.connectionStringFor(adminUrl, databaseName);

    try {
      await this.applyTenantSchema(connectionString);
    } catch (error) {
      throw new ProvisioningError(`Database created but tenant schema failed to apply for ${input.slug}`, error);
    }

    return { connectionString };
  }

  /**
   * Runs the tenant application's own `prisma migrate deploy` against the
   * freshly created database — the identical command `apps/api`'s
   * `db:deploy` script runs against any other environment. The schema
   * path is configurable (`PLATFORM_TENANT_SCHEMA_PATH`) because a
   * packaged/deployed topology may not co-locate apps/api and
   * apps/platform the way this monorepo checkout does.
   */
  private async applyTenantSchema(connectionString: string): Promise<void> {
    const schemaPath = process.env.PLATFORM_TENANT_SCHEMA_PATH ?? '../api/prisma/schema';
    await execFileAsync('npx', ['prisma', 'migrate', 'deploy', '--schema', schemaPath], {
      env: { ...process.env, DATABASE_URL: connectionString },
      cwd: process.cwd(),
    });
  }

  async deprovision(input: { slug: string; connectionString: string }): Promise<void> {
    const adminUrl = this.config.get('PLATFORM_PROVISIONING_ADMIN_URL');
    const databaseName = this.databaseNameFor(input.slug);

    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      // Terminate any lingering connections before DROP DATABASE, which
      // Postgres otherwise refuses while a session still holds the database.
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [databaseName],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      this.logger.log(`Dropped isolated database ${databaseName} for tenant ${input.slug}`);
    } finally {
      await admin.end();
    }
  }
}

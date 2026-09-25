import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../core/config/app-config.service';
import { TenantExportError, type TenantExportRunner } from './export-runner';

const execFileAsync = promisify(execFile);

/**
 * The real, working default `TenantExportRunner` — WO-39.7's own "real,
 * buildable application code, not infrastructure" mandate made concrete:
 * `pg_dump --format=custom` against the tenant's own already-resolved
 * connection string (never a second, independent connection-resolution
 * path — see `TenantCredentialResolverService`), written to a local
 * directory scoped by tenant slug. Storage is local disk today
 * (`PLATFORM_EXPORT_STORAGE_DIR`) rather than object storage, named
 * honestly as a real, if narrower, deployment choice — the
 * `TenantExportRunner` seam is what lets a future S3-backed
 * implementation replace this one without touching `TenantExportService`.
 */
@Injectable()
export class PgDumpExportRunner implements TenantExportRunner {
  readonly name = 'pg-dump-local-filesystem';
  private readonly logger = new Logger(PgDumpExportRunner.name);

  constructor(private readonly config: AppConfigService) {}

  async run(input: { tenantSlug: string; exportId: string; connectionString: string }): Promise<{ storageKey: string; sizeBytes: number }> {
    const baseDir = resolve(this.config.get('PLATFORM_EXPORT_STORAGE_DIR'));
    const tenantDir = join(baseDir, input.tenantSlug);
    await mkdir(tenantDir, { recursive: true });
    const outputPath = join(tenantDir, `${input.exportId}.dump`);

    try {
      await execFileAsync('pg_dump', ['--format=custom', '--no-owner', '--file', outputPath, input.connectionString]);
    } catch (error) {
      throw new TenantExportError(`pg_dump failed for tenant ${input.tenantSlug}`, error);
    }

    const { size } = await stat(outputPath);
    this.logger.log(`Exported tenant ${input.tenantSlug} to ${outputPath} (${size} bytes)`);
    return { storageKey: outputPath, sizeBytes: size };
  }
}

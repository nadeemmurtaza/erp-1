/**
 * WO-39.7's own extension point, the same `DeploymentProvisioner`-shaped
 * seam `modules/tenants/deployment-provisioner.ts` already establishes:
 * `TenantExportService` calls this interface and never a concrete
 * implementation directly, so a future object-storage-backed exporter (S3,
 * GCS) is a class swap, never a rewrite of the export job's own state
 * machine (PENDING -> RUNNING -> COMPLETE/FAILED).
 */
export interface TenantExportRunner {
  readonly name: string;

  /**
   * Dumps the tenant's own isolated database (reached via its already-
   * resolved connection string — this interface never resolves credentials
   * itself) and stores the archive somewhere retrievable. MUST NOT touch
   * any other tenant's data; the connection string is the only thing that
   * scopes this call.
   */
  run(input: { tenantSlug: string; exportId: string; connectionString: string }): Promise<{ storageKey: string; sizeBytes: number }>;
}

export class TenantExportError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TenantExportError';
  }
}

/**
 * Extension point: how a tenant's isolated deployment actually gets
 * created — doc 39 §"What this tier owes every tenant", and the same
 * `StorageDriver`/`PaymentProvider` shape every other integration point in
 * this repository already uses. `ProvisioningService` calls this interface
 * and never a concrete implementation directly, so the orchestrator this
 * tier eventually runs on (doc 39's own named out-of-scope: "which
 * orchestrator enforces resource quotas... is an operations decision") is
 * a class swap, never a rewrite of the provisioning state machine.
 */
export interface DeploymentProvisioner {
  readonly name: string;

  /**
   * Creates a brand-new, fully isolated database for this tenant and
   * returns its connection string. MUST be safe to call twice for the
   * same slug (the caller enforces idempotency at the tenant-row level,
   * but a provisioner that itself throws on "already exists" rather than
   * a generic error makes that easier to detect).
   */
  provision(input: { slug: string }): Promise<{ connectionString: string }>;

  /**
   * Reverses provision() — doc 39 WO-39.7's own retention window governs
   * WHEN this is called, never this method's own concern.
   */
  deprovision(input: { slug: string; connectionString: string }): Promise<void>;
}

export class ProvisioningError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProvisioningError';
  }
}

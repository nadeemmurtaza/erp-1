import { z } from 'zod';

/**
 * The control plane's own environment contract — deliberately separate from
 * apps/api's `env.validation.ts`. Per `39-shared-cross-tenant-hosting-tier.md`
 * and the DECISIONS.md entry on shared-infrastructure/isolated-data, this
 * app never touches a tenant's own `DATABASE_URL` or `APP_ENCRYPTION_KEY` —
 * every var here is prefixed `PLATFORM_` so the two configs can never be
 * confused for each other, even if both `.env` files are loaded together.
 */
const port = (fallback: number) =>
  z.coerce.number().int().min(1).max(65535).default(fallback);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** The control plane's own database — PlatformTenant, billing, support access. Never a tenant's. */
  PLATFORM_DATABASE_URL: z.string().min(1, 'PLATFORM_DATABASE_URL is required'),

  /**
   * A Postgres connection with CREATEDB privilege, used ONLY by
   * `PostgresDatabaseProvisioner` to create a brand-new, isolated database
   * per tenant. Deliberately separate from PLATFORM_DATABASE_URL: the
   * control plane's own operational data and the credential that can
   * create new tenant databases are two different blast radii.
   */
  PLATFORM_PROVISIONING_ADMIN_URL: z.string().min(1, 'PLATFORM_PROVISIONING_ADMIN_URL is required'),

  /**
   * AES-256-GCM key for TenantDeploymentCredential's encrypted connection
   * string. Exactly 32 bytes, distinct from any tenant's own encryption
   * key — see doc 39 §1's note that `deploymentRef` is a pointer, never a
   * plain credential.
   */
  PLATFORM_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'utf8').length === 32, 'PLATFORM_ENCRYPTION_KEY must be exactly 32 bytes'),

  /**
   * Server-side pepper mixed into PlatformOpsClient key hashing — a second
   * secret an attacker would need even after a full database dump, the
   * same defence-in-depth `hashApiKey` alone does not provide on its own.
   */
  PLATFORM_OPS_KEY_PEPPER: z.string().min(32, 'PLATFORM_OPS_KEY_PEPPER must be at least 32 characters'),

  PLATFORM_API_PORT: port(3100),
  PLATFORM_API_PREFIX: z.string().default('platform'),

  /**
   * WO-39.3 — the base domain a tenant's own subdomain is resolved
   * against ("acme" + this value = "acme.<this>"). Never hardcoded in
   * HostnameResolverService, exactly as Law 1 requires of every other
   * brand/deployment literal in this repository.
   */
  PLATFORM_HOSTNAME_BASE_DOMAIN: z.string().min(1, 'PLATFORM_HOSTNAME_BASE_DOMAIN is required'),

  /** Used to build a self-service signup's own email-verification link. */
  PLATFORM_PUBLIC_BASE_URL: z.string().default('http://localhost:3100'),

  /** WO-51.2 — how long a signup's email-verification link stays valid. */
  PLATFORM_SIGNUP_VERIFICATION_TTL_MINUTES: z.coerce.number().int().min(1).default(30),
  /** WO-51.1/51.3 — a trial's default length, and how many days before
   *  `trialExpiresAt` a warning notification fires. */
  PLATFORM_TRIAL_DEFAULT_DAYS: z.coerce.number().int().min(1).default(14),
  PLATFORM_TRIAL_EXPIRY_WARNING_DAYS: z.coerce.number().int().min(0).default(3),
  /** WO-51.3's own "digest, never one ping per trial" threshold — past
   *  this many trials expiring/warned in one run, hosting-ops gets one
   *  digest email instead of one per trial. */
  PLATFORM_TRIAL_DIGEST_THRESHOLD: z.coerce.number().int().min(1).default(10),

  /** WO-39.7 — how long a DEPROVISIONED tenant's data survives before
   *  actual teardown becomes eligible; TRIAL's own (shorter) policy is
   *  named explicitly by doc 51 rather than sharing the paying-tenant one. */
  PLATFORM_RETENTION_DAYS_DEFAULT: z.coerce.number().int().min(1).default(30),
  PLATFORM_RETENTION_DAYS_TRIAL: z.coerce.number().int().min(1).default(7),
  /** WO-39.7 — where TenantExportStorage's local-filesystem implementation
   *  writes an export archive. A future object-storage implementation is a
   *  class swap behind the same DEPLOYMENT_PROVISIONER-shaped token, never
   *  a rewrite of the export job itself. */
  PLATFORM_EXPORT_STORAGE_DIR: z.string().default('./exports'),
  /** How long a completed export's own downloadable artifact stays
   *  retrievable — independent of, and always <= a sane bound under, the
   *  source tenant's own retention window. */
  PLATFORM_EXPORT_DOWNLOAD_TTL_DAYS: z.coerce.number().int().min(1).default(14),

  /** WO-50.4 — the discount-from-list-price percentage above which a
   *  custom quote needs a second approver. A business policy number,
   *  resolved through config exactly as `.claude/rules/configuration.md`
   *  requires, never a literal in `CustomQuoteService`. */
  PLATFORM_QUOTE_DISCOUNT_APPROVAL_THRESHOLD_PCT: z.coerce.number().min(0).max(100).default(20),

  /**
   * Audience for the "hosting-ops" / "sales-pipeline" digest doc 39's and
   * doc 51's own "audience is a capability, not an address" lens name —
   * resolved from config, never a literal address in a listener. Optional:
   * a deployment that hasn't configured it yet gets a logged, skipped
   * digest rather than a boot failure, since alerting is additive to the
   * per-tenant notifications this app already sends.
   */
  PLATFORM_OPS_ALERT_EMAIL: z.string().email().optional(),

  /**
   * Outbound mail — optional. When unset, PlatformNotificationsService logs
   * the message it would have sent instead of throwing, so a deployment
   * without SMTP configured yet degrades honestly (CLAUDE.md's resilience
   * pillar) rather than failing every trial/quota/export flow that wants
   * to notify someone.
   */
  PLATFORM_SMTP_HOST: z.string().optional(),
  PLATFORM_SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  PLATFORM_SMTP_USER: z.string().optional(),
  PLATFORM_SMTP_PASS: z.string().optional(),
  PLATFORM_SMTP_FROM: z.string().default('no-reply@platform.local'),

  /** WO-39.5 — "never indefinite" enforced, not merely required-but-
   *  unbounded: a caller cannot set `expiresAt` further out than this many
   *  hours from issuance, whatever value they request. */
  PLATFORM_SUPPORT_GRANT_MAX_HOURS: z.coerce.number().int().min(1).default(72),
});

export type PlatformEnv = z.infer<typeof envSchema>;

export function validatePlatformEnv(config: Record<string, unknown>): PlatformEnv {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid platform environment:\n${result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  }
  return result.data;
}

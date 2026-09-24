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
});

export type PlatformEnv = z.infer<typeof envSchema>;

export function validatePlatformEnv(config: Record<string, unknown>): PlatformEnv {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid platform environment:\n${result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  }
  return result.data;
}

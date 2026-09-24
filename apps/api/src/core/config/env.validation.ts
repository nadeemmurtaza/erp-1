import { BRAND } from '@newax/shared';
import { z } from 'zod';

/**
 * Environment contract. The API refuses to boot on an invalid .env rather than
 * failing later with a confusing runtime error — a missing JWT secret should
 * stop startup, not produce unverifiable tokens.
 */

const csv = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    );

const bool = (fallback: 'true' | 'false') =>
  z
    .string()
    .default(fallback)
    .transform((value) => value.toLowerCase() === 'true');

const port = (fallback: number) =>
  z.coerce.number().int().min(1).max(65535).default(fallback);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  API_PORT: port(3001),
  API_PREFIX: z.string().default('api'),
  CORS_ORIGINS: csv('http://localhost:3000,http://localhost:3002'),

  // 32 characters is the shortest secret worth having for HS256.
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  /**
   * AES-256-GCM key for secrets stored in the database — today, an
   * EmailAccount's SMTP/IMAP passwords (`@newax/shared`'s secret-crypto).
   * Exactly 32 bytes, distinct from the JWT secrets: rotating one must never
   * silently break the other. Generate with:
   *   openssl rand -base64 24 | head -c 32
   */
  APP_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, 'utf8').length === 32, {
      message: 'APP_ENCRYPTION_KEY must be exactly 32 bytes',
    }),

  MODULES: csv(
    'catalog,measurements,cart,orders,payments,stitching,inventory,purchasing,crm,analytics,reports,tracking,finance,bom',
  ),

  /**
   * Which tier of the retail topology this deployment is (RETAIL-ERP.md R1,
   * R14). STANDALONE is the default and is what every deployment today
   * already is — one node, one database, no replication, every chain concept
   * invisible. BRANCH and BRAND replicate to a PARENT_URL; ORG has nothing
   * above it. The same schema and the same image run at every tier; only
   * this value differs, exactly like MODULES.
   */
  NODE_ROLE: z.enum(['STANDALONE', 'BRANCH', 'BRAND', 'ORG']).default('STANDALONE'),
  /** Unique per deployment. The replication origin id (R2, R6) once Tranche 3 exists. */
  NODE_ID: z.string().min(1).default('main'),
  /** Where this node pulls policy from and pushes facts to. Required for BRANCH — a branch always reports to a brand. Optional for BRAND (a Chain-edition brand has no organization above it); refused for ORG and STANDALONE, which are the top of whatever topology they have. */
  PARENT_URL: z.string().url().optional(),
  /** The credential PARENT_URL issued this node (WO-20.2) — same shape as PARENT_URL: required wherever PARENT_URL is, refused wherever it is refused, since one never makes sense without the other. */
  PARENT_API_KEY: z.string().optional(),

  PAYMENT_PROVIDERS: csv('cod,bank_transfer'),
  /** WO-6.2's own allowlist — same idiom as PAYMENT_PROVIDERS. `manual` is the only driver built; see courier-provider.ts for why. */
  COURIER_PROVIDERS: csv('manual'),
  NOTIFICATION_CHANNELS: csv('log'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool('true'),
  S3_PUBLIC_URL: z.string().optional(),
  LOCAL_STORAGE_DIR: z.string().default('./uploads'),
  LOCAL_STORAGE_PUBLIC_URL: z.string().default('http://localhost:3001/api/v1/files'),

  JAZZCASH_MERCHANT_ID: z.string().optional(),
  JAZZCASH_PASSWORD: z.string().optional(),
  JAZZCASH_INTEGRITY_SALT: z.string().optional(),
  JAZZCASH_RETURN_URL: z.string().optional(),
  JAZZCASH_SANDBOX: bool('true'),

  EASYPAISA_STORE_ID: z.string().optional(),
  EASYPAISA_HASH_KEY: z.string().optional(),
  EASYPAISA_RETURN_URL: z.string().optional(),
  EASYPAISA_SANDBOX: bool('true'),

  /** Giftkarta — a third-party gift-card network redeemable at checkout (GiftkartaProvider). No verified API reference was available when this was written; confirm the base URL and every field name against Giftkarta's own docs before enabling. */
  GIFTKARTA_API_BASE_URL: z.string().optional(),
  GIFTKARTA_API_KEY: z.string().optional(),

  // nID (github.com/nadeemmurtaza/nID) — this shop's identity-verification
  // tenant credentials. Optional at the env-schema level, same as the
  // payment-gateway secrets above: the identity-verification module has to
  // be in MODULES too, and NidVerificationProvider throws at call time
  // (not boot time) if these are missing while it's enabled.
  NID_API_URL: z.string().optional(),
  NID_API_KEY: z.string().optional(),
  /** Verifies inbound webhooks from nID — see providers/nid.provider.ts. */
  NID_WEBHOOK_SECRET: z.string().optional(),

  // Outbound email. Plain SMTP on purpose: the mail server is ours (see
  // docker-compose.mail.yml), and if its reputation ever disappoints, pointing
  // these four values at a relay is the whole migration — no code changes.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: port(587),
  /** True for implicit TLS on 465. Port 587 upgrades with STARTTLS instead. */
  SMTP_SECURE: bool('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  /** Envelope sender. Its domain is what SPF, DKIM and DMARC are checked against. */
  MAIL_FROM: z.string().default(`${BRAND.identity.name} <no-reply@${BRAND.identity.domain}>`),
  /** Where replies land. Customers do reply to order mail — send it somewhere staffed. */
  MAIL_REPLY_TO: z.string().optional(),

  STORE_NAME: z.string().default(BRAND.identity.name),
  /** Public storefront origin. Builds the order links and image URLs in emails. */
  STOREFRONT_URL: z.string().default('http://localhost:3000'),
  /** Shown in bank-transfer emails so the customer knows where to send a screenshot. */
  SUPPORT_WHATSAPP: z.string().optional(),
  /**
   * Bank account details for the bank-transfer flow, as free text. Free text
   * rather than structured fields because what a Pakistani bank needs on a
   * transfer varies — IBAN, account title, branch, or a JazzCash number.
   */
  BANK_TRANSFER_DETAILS: z.string().optional(),

  SEED_ADMIN_EMAIL: z.string().email().default(`admin@${BRAND.identity.domain}`),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('admin12345'),
});

export type Env = z.infer<typeof envSchema>;

/** A newline, kept as a constant so the hint below stays readable. */
const NEWLINE = String.fromCharCode(10);

/**
 * What to actually DO about a missing variable, printed under the failure.
 *
 * A container that exits with "APP_ENCRYPTION_KEY: Required" mid-deploy tells
 * whoever is reading the logs nothing about how to fix it, and the answer is
 * not guessable: the key must be a specific length and, once data has been
 * written with it, must never change. One line here is the difference between
 * a two-minute fix and an outage of unknown length.
 */
const SETUP_HINTS: Record<string, string> = {
  APP_ENCRYPTION_KEY:
    'Generate with: openssl rand -hex 16   (exactly 32 bytes). Encrypts stored ' +
    'email-account passwords and signs unsubscribe links, so keep it secret and ' +
    'NEVER change it once the app has written data - rotating it makes existing ' +
    'encrypted values unreadable.',
  JWT_ACCESS_SECRET: 'Generate with: openssl rand -base64 48',
  JWT_REFRESH_SECRET:
    'Generate with: openssl rand -base64 48 (must differ from the access secret)',
  DATABASE_URL: 'Shape: postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public',
};

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const name = issue.path.join('.');
        const hint = SETUP_HINTS[name];
        const suffix = hint ? NEWLINE + '      ' + hint : '';
        return `  - ${name}: ${issue.message}${suffix}`;
      })
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  if (result.data.STORAGE_DRIVER === 's3') {
    const missing = (['S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const).filter(
      (key) => !result.data[key],
    );
    if (missing.length > 0) {
      throw new Error(`STORAGE_DRIVER=s3 requires: ${missing.join(', ')}`);
    }
  }

  // Same shape as the S3 check above: naming a channel you have not configured
  // is a deployment mistake worth failing on, not one to discover from an
  // order confirmation that silently never arrived.
  if (result.data.NODE_ENV === 'production' &&
    result.data.JWT_ACCESS_SECRET.includes('change-me')
  ) {
    throw new Error('Refusing to start in production with the example JWT secrets.');
  }

  if (result.data.NODE_ENV === 'production' &&
    result.data.APP_ENCRYPTION_KEY.toLowerCase().includes('change-me')
  ) {
    throw new Error('Refusing to start in production with the example APP_ENCRYPTION_KEY.');
  }

  if (result.data.NOTIFICATION_CHANNELS.includes('email')) {
    const missing = (['SMTP_HOST', 'SMTP_PASSWORD'] as const).filter(
      (key) => !result.data[key],
    );
    if (missing.length > 0) {
      throw new Error(
        `NOTIFICATION_CHANNELS includes "email" but missing: ${missing.join(', ')}`,
      );
    }
  }

  // RETAIL-ERP.md R1: "the API refuses to boot without it" for the tier
  // relationship that follows from NODE_ROLE — a branch with nowhere to
  // replicate to, or a top-of-topology node pointed somewhere, is a
  // misconfigured deployment, not a valid one.
  if (result.data.NODE_ROLE === 'BRANCH' && !result.data.PARENT_URL) {
    throw new Error(
      'NODE_ROLE=BRANCH requires PARENT_URL — a branch always replicates to its brand.',
    );
  }
  if (
    (result.data.NODE_ROLE === 'ORG' || result.data.NODE_ROLE === 'STANDALONE') &&
    result.data.PARENT_URL
  ) {
    throw new Error(
      `NODE_ROLE=${result.data.NODE_ROLE} does not take a PARENT_URL — it is the top of its topology.`,
    );
  }
  // PARENT_API_KEY follows PARENT_URL exactly (WO-20.2) — a URL with no
  // credential can never authenticate, and a credential with no URL has
  // nothing to call.
  if (result.data.PARENT_URL && !result.data.PARENT_API_KEY) {
    throw new Error('PARENT_URL is set but PARENT_API_KEY is not — this node cannot authenticate to its parent.');
  }
  if (result.data.PARENT_API_KEY && !result.data.PARENT_URL) {
    throw new Error('PARENT_API_KEY is set but PARENT_URL is not — there is nothing to call with it.');
  }

  return result.data;
}

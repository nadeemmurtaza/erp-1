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
  REDIS_URL: z.string().default('redis://localhost:6379'),

  API_PORT: port(3001),
  API_PREFIX: z.string().default('api'),
  CORS_ORIGINS: csv('http://localhost:3000'),

  // 32 characters is the shortest secret worth having for HS256.
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  MODULES: csv(
    'catalog,measurements,cart,orders,payments,stitching,inventory,crm,analytics,reports,tracking',
  ),
  PAYMENT_PROVIDERS: csv('cod,bank_transfer'),
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
  MAIL_FROM: z.string().default('Yaseen <no-reply@yaseen.pk>'),
  /** Where replies land. Customers do reply to order mail — send it somewhere staffed. */
  MAIL_REPLY_TO: z.string().optional(),

  STORE_NAME: z.string().default('Yaseen'),
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

  SEED_ADMIN_EMAIL: z.string().email().default('admin@yaseen.pk'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('admin12345'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
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

  return result.data;
}

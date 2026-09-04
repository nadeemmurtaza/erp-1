import { validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/yaseen',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  APP_ENCRYPTION_KEY: 'c'.repeat(32),
};

describe('validateEnv', () => {
  it('fills in defaults for everything optional', () => {
    const env = validateEnv({ ...base });

    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3001);
    expect(env.STORAGE_DRIVER).toBe('local');
    expect(env.PAYMENT_PROVIDERS).toEqual(['cod', 'bank_transfer']);
  });

  it('parses comma-separated allowlists into arrays', () => {
    const env = validateEnv({ ...base, MODULES: 'catalog, orders ,crm' });
    expect(env.MODULES).toEqual(['catalog', 'orders', 'crm']);
  });

  it('refuses to start without a database URL', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('refuses a JWT secret short enough to brute force', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /at least 32 characters/,
    );
  });

  it('refuses S3 storage without credentials', () => {
    expect(() => validateEnv({ ...base, STORAGE_DRIVER: 's3' })).toThrow(
      /S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY/,
    );
  });

  it('accepts S3 storage once credentials are supplied', () => {
    const env = validateEnv({
      ...base,
      STORAGE_DRIVER: 's3',
      S3_BUCKET: 'yaseen',
      S3_ACCESS_KEY: 'key',
      S3_SECRET_KEY: 'secret',
    });
    expect(env.STORAGE_DRIVER).toBe('s3');
  });

  it('refuses to start in production with the example secrets', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'dev-access-secret-change-me-in-production-0000000000',
      }),
    ).toThrow(/example JWT secrets/);
  });

  it('refuses to start when the email channel has no SMTP server behind it', () => {
    expect(() =>
      validateEnv({ ...base, NOTIFICATION_CHANNELS: 'log,email' }),
    ).toThrow(/SMTP_HOST/);
  });

  it('accepts the email channel once SMTP_HOST and SMTP_PASSWORD are supplied', () => {
    const env = validateEnv({
      ...base,
      NOTIFICATION_CHANNELS: 'log,email',
      SMTP_HOST: 'smtp',
      SMTP_PASSWORD: 'secret',
    });
    expect(env.NOTIFICATION_CHANNELS).toContain('email');
  });

  it('leaves the email channel off by default', () => {
    expect(validateEnv(base).NOTIFICATION_CHANNELS).toEqual(['log']);
  });

  it('reports every problem at once rather than one at a time', () => {
    expect(() =>
      validateEnv({ JWT_ACCESS_SECRET: 'short', JWT_REFRESH_SECRET: 'short' }),
    ).toThrow(/DATABASE_URL[\s\S]*JWT_ACCESS_SECRET[\s\S]*JWT_REFRESH_SECRET/);
  });
});

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

  it('defaults NODE_ROLE to STANDALONE — every deployment today, with no topology', () => {
    const env = validateEnv({ ...base });
    expect(env.NODE_ROLE).toBe('STANDALONE');
    expect(env.NODE_ID).toBe('main');
    expect(env.PARENT_URL).toBeUndefined();
  });

  it('refuses NODE_ROLE=BRANCH without PARENT_URL', () => {
    expect(() => validateEnv({ ...base, NODE_ROLE: 'BRANCH' })).toThrow(
      /NODE_ROLE=BRANCH requires PARENT_URL/,
    );
  });

  it('accepts NODE_ROLE=BRANCH once PARENT_URL and PARENT_API_KEY are supplied', () => {
    const env = validateEnv({
      ...base,
      NODE_ROLE: 'BRANCH',
      NODE_ID: 'lhr-01',
      PARENT_URL: 'https://brand1.example',
      PARENT_API_KEY: 'node_rawkey',
    });
    expect(env.NODE_ROLE).toBe('BRANCH');
    expect(env.PARENT_URL).toBe('https://brand1.example');
    expect(env.PARENT_API_KEY).toBe('node_rawkey');
  });

  it('refuses a PARENT_URL with no PARENT_API_KEY — nothing to authenticate with', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ROLE: 'BRANCH', NODE_ID: 'lhr-01', PARENT_URL: 'https://brand1.example' }),
    ).toThrow(/PARENT_URL is set but PARENT_API_KEY is not/);
  });

  it('refuses a PARENT_API_KEY with no PARENT_URL — nothing to call', () => {
    expect(() => validateEnv({ ...base, PARENT_API_KEY: 'node_rawkey' })).toThrow(
      /PARENT_API_KEY is set but PARENT_URL is not/,
    );
  });

  it('accepts NODE_ROLE=BRAND with no PARENT_URL — a Chain-edition brand has no organization above it', () => {
    const env = validateEnv({ ...base, NODE_ROLE: 'BRAND', NODE_ID: 'brand1' });
    expect(env.PARENT_URL).toBeUndefined();
  });

  it('refuses a PARENT_URL on NODE_ROLE=ORG — it is the top of its topology', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ROLE: 'ORG',
        NODE_ID: 'org',
        PARENT_URL: 'https://somewhere.example',
      }),
    ).toThrow(/NODE_ROLE=ORG does not take a PARENT_URL/);
  });

  it('refuses a PARENT_URL on the default NODE_ROLE=STANDALONE', () => {
    expect(() => validateEnv({ ...base, PARENT_URL: 'https://somewhere.example' })).toThrow(
      /NODE_ROLE=STANDALONE does not take a PARENT_URL/,
    );
  });

  it('refuses an unknown NODE_ROLE', () => {
    expect(() => validateEnv({ ...base, NODE_ROLE: 'REGIONAL_HUB' })).toThrow();
  });

  describe('REDIS_URL (206-rate-limiting-caching-compression-hardening.md §1.2)', () => {
    const production = {
      ...base,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'p'.repeat(48),
      JWT_REFRESH_SECRET: 'q'.repeat(48),
      APP_ENCRYPTION_KEY: 'r'.repeat(32),
    };

    it('defaults to the local development instance outside production', () => {
      expect(validateEnv({ ...base }).REDIS_URL).toBe('redis://localhost:6379');
    });

    it('refuses to start in production without an explicit REDIS_URL, and says what to do', () => {
      expect(() => validateEnv(production)).toThrow(/REDIS_URL is required in production[\s\S]*never the mail server/);
    });

    it('starts in production once REDIS_URL names the dedicated instance', () => {
      const env = validateEnv({ ...production, REDIS_URL: 'redis://:secret@redis:6379' });
      expect(env.REDIS_URL).toBe('redis://:secret@redis:6379');
    });

    it('accepts a TLS URL', () => {
      expect(validateEnv({ ...base, REDIS_URL: 'rediss://cache.example:6380' }).REDIS_URL).toBe('rediss://cache.example:6380');
    });

    it.each([
      ['a database path — it would override every keyspace\'s own database', 'redis://localhost:6379/1'],
      ['a db query parameter, for the same reason', 'redis://localhost:6379?db=2'],
      ['a non-Redis scheme', 'http://localhost:6379'],
      ['something that is not a URL', 'localhost:6379'],
    ])('refuses %s', (_reason, value) => {
      expect(() => validateEnv({ ...base, REDIS_URL: value })).toThrow(/REDIS_URL must be redis:\/\//);
    });
  });
});

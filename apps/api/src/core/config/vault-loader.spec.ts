import { loadVaultSecrets } from './vault-loader';

describe('VaultLoader (WO-255.3)', () => {
  const originalEnv = { ...process.env };
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    originalFetch = global.fetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns disabled when NID_VAULT_ENABLED is not set', async () => {
    delete process.env.NID_VAULT_ENABLED;

    const result = await loadVaultSecrets();

    expect(result.loaded).toBe(false);
    expect(result.reason).toBe('disabled');
    expect(result.count).toBe(0);
  });

  it('returns missing_credentials when NID_VAULT_ENABLED is true but NID_SERVICE_SECRET is unset', async () => {
    process.env.NID_VAULT_ENABLED = 'true';
    delete process.env.NID_SERVICE_SECRET;

    const result = await loadVaultSecrets();

    expect(result.loaded).toBe(false);
    expect(result.reason).toBe('missing_credentials');
    expect(result.count).toBe(0);
  });

  it('successfully fetches and injects secrets into process.env', async () => {
    process.env.NID_VAULT_ENABLED = 'true';
    process.env.NID_SERVICE_SECRET = 'super-secret-vault-token';
    process.env.NID_BASE_URL = 'http://localhost:4000';

    const mockSecrets = {
      DATABASE_PASSWORD: 'vault-injected-db-pass',
      PAYMENT_GATEWAY_KEY: 'pk_live_vault_abc123',
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ secrets: mockSecrets }),
    } as unknown as Response);

    const result = await loadVaultSecrets();

    expect(result.loaded).toBe(true);
    expect(result.count).toBe(2);
    expect(process.env.DATABASE_PASSWORD).toBe('vault-injected-db-pass');
    expect(process.env.PAYMENT_GATEWAY_KEY).toBe('pk_live_vault_abc123');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/vault/secrets/export',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          serviceId: 'erp-1',
          serviceSecret: 'super-secret-vault-token',
        }),
      }),
    );
  });

  it('handles flat JSON dictionary response without wrapping secrets object', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        STRIPE_API_KEY: 'sk_live_flat_key',
      }),
    } as unknown as Response);

    const result = await loadVaultSecrets({
      vaultEnabled: true,
      serviceId: 'erp-1',
      serviceSecret: 'test-secret',
      nidBaseUrl: 'http://nid.corp.local',
    });

    expect(result.loaded).toBe(true);
    expect(result.count).toBe(1);
    expect(process.env.STRIPE_API_KEY).toBe('sk_live_flat_key');
  });

  it('falls back gracefully when nID Vault returns an HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: jest.fn().mockResolvedValue('Invalid service secret'),
    } as unknown as Response);

    const result = await loadVaultSecrets({
      vaultEnabled: true,
      serviceSecret: 'wrong-secret',
    });

    expect(result.loaded).toBe(false);
    expect(result.reason).toBe('unreachable_or_error');
    expect(result.error).toContain('HTTP 403');
  });

  it('falls back gracefully when nID Vault is offline / throws network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:4000'));

    const result = await loadVaultSecrets({
      vaultEnabled: true,
      serviceSecret: 'test-secret',
    });

    expect(result.loaded).toBe(false);
    expect(result.reason).toBe('unreachable_or_error');
    expect(result.error).toContain('ECONNREFUSED');
  });
});

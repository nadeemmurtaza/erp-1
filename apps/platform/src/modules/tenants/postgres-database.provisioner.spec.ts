jest.mock('node:child_process', () => ({ execFile: jest.fn((_cmd, _args, _opts, cb) => cb?.(null, '', '')) }));

const mockClient = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn(),
};
jest.mock('pg', () => ({ Client: jest.fn(() => mockClient) }));

import { ProvisioningError } from './deployment-provisioner';
import { PostgresDatabaseProvisioner } from './postgres-database.provisioner';

const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';

describe('PostgresDatabaseProvisioner', () => {
  let provisioner: PostgresDatabaseProvisioner;
  const config = { get: () => ADMIN_URL };

  beforeEach(() => {
    jest.clearAllMocks();
    provisioner = new PostgresDatabaseProvisioner(config as any);
  });

  it('creates the database when it does not already exist', async () => {
    mockClient.query.mockResolvedValueOnce({ rowCount: 0 }); // exists check

    const result = await provisioner.provision({ slug: 'acme' });

    expect(mockClient.query).toHaveBeenCalledWith('SELECT 1 FROM pg_database WHERE datname = $1', ['tenant_acme']);
    expect(mockClient.query).toHaveBeenCalledWith('CREATE DATABASE "tenant_acme"');
    expect(result.connectionString).toContain('/tenant_acme');
  });

  it('is idempotent — does not re-create an already-existing database', async () => {
    mockClient.query.mockResolvedValueOnce({ rowCount: 1 }); // exists check finds a row

    await provisioner.provision({ slug: 'acme' });

    const createCalls = mockClient.query.mock.calls.filter((c) => String(c[0]).startsWith('CREATE DATABASE'));
    expect(createCalls).toHaveLength(0);
  });

  it('generates a hyphen-free database name from a hyphenated slug', async () => {
    mockClient.query.mockResolvedValueOnce({ rowCount: 0 });

    const result = await provisioner.provision({ slug: 'acme-retail-group' });

    expect(mockClient.query).toHaveBeenCalledWith('CREATE DATABASE "tenant_acme_retail_group"');
    expect(result.connectionString).toContain('/tenant_acme_retail_group');
  });

  it('wraps a failed CREATE DATABASE in ProvisioningError', async () => {
    mockClient.query.mockResolvedValueOnce({ rowCount: 0 }).mockRejectedValueOnce(new Error('permission denied'));

    await expect(provisioner.provision({ slug: 'acme' })).rejects.toThrow(ProvisioningError);
  });

  it('always closes the admin connection, even on failure', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('connection refused'));

    await expect(provisioner.provision({ slug: 'acme' })).rejects.toThrow();
    expect(mockClient.end).toHaveBeenCalled();
  });

  it('deprovision terminates active connections before dropping the database', async () => {
    mockClient.query.mockResolvedValue({ rowCount: 0 });

    await provisioner.deprovision({ slug: 'acme', connectionString: 'postgresql://x/tenant_acme' });

    expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('pg_terminate_backend'), ['tenant_acme']);
    expect(mockClient.query).toHaveBeenCalledWith('DROP DATABASE IF EXISTS "tenant_acme"');
  });
});

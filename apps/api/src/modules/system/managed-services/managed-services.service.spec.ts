import { ServiceUnavailableException } from '@nestjs/common';
import { ManagedServicesService } from './managed-services.service';

describe('ManagedServicesService', () => {
  let config: any;
  let service: ManagedServicesService;
  const configValues: Record<string, unknown> = {
    AGENCY_API_URL: 'https://platform.example.com/platform',
    AGENCY_API_KEY: 'a-real-agency-api-key',
  };

  beforeEach(() => {
    config = { get: (key: string) => configValues[key] };
    service = new ManagedServicesService(config);
    global.fetch = jest.fn();
  });

  it('throws ServiceUnavailableException when unconfigured, and never calls fetch', async () => {
    configValues.AGENCY_API_URL = undefined;
    await expect(service.getUsage()).rejects.toThrow(ServiceUnavailableException);
    expect(global.fetch).not.toHaveBeenCalled();
    configValues.AGENCY_API_URL = 'https://platform.example.com/platform';
  });

  it('getUsage() calls the Master Platform reporting endpoint with the agency key header, never exposing it in the response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => [{ snapshotDate: '2026-09-01' }] });

    const result = await service.getUsage();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://platform.example.com/platform/agency/clients/me/usage',
      { headers: { 'x-agency-api-key': 'a-real-agency-api-key' } },
    );
    expect(result).toEqual([{ snapshotDate: '2026-09-01' }]);
  });

  it('getInvoices() calls the invoices endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => [] });
    await service.getInvoices();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://platform.example.com/platform/agency/clients/me/invoices',
      expect.any(Object),
    );
  });

  it('surfaces a non-OK response as ServiceUnavailableException, never the raw upstream body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });
    await expect(service.getUsage()).rejects.toThrow(ServiceUnavailableException);
  });

  it('surfaces a network failure as ServiceUnavailableException', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.getUsage()).rejects.toThrow(ServiceUnavailableException);
  });
});

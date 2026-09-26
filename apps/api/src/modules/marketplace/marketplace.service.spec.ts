import { ServiceUnavailableException } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';

describe('MarketplaceService — 165-cross-tenant-marketplace-directory.md WO-165.2', () => {
  let config: any;
  let service: MarketplaceService;
  const configValues: Record<string, unknown> = {
    MARKETPLACE_API_URL: 'https://platform.example.com/platform',
    MARKETPLACE_API_KEY: 'a-real-marketplace-api-key',
  };

  beforeEach(() => {
    config = { get: (key: string) => configValues[key] };
    service = new MarketplaceService(config);
    global.fetch = jest.fn();
  });

  it('throws ServiceUnavailableException when unconfigured, and never calls fetch', async () => {
    configValues.MARKETPLACE_API_URL = undefined;
    await expect(service.listMine()).rejects.toThrow(ServiceUnavailableException);
    expect(global.fetch).not.toHaveBeenCalled();
    configValues.MARKETPLACE_API_URL = 'https://platform.example.com/platform';
  });

  it('listMine() calls the platform listings endpoint with the marketplace key header', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => [{ id: 'l1' }] });

    const result = await service.listMine();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://platform.example.com/platform/marketplace/v1/listings',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ 'x-marketplace-api-key': 'a-real-marketplace-api-key' }) }),
    );
    expect(result).toEqual([{ id: 'l1' }]);
  });

  it('publish() POSTs the listing body as JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ id: 'l1' }) });

    await service.publish({
      kind: 'PRODUCT',
      externalRef: 'p1',
      title: 'Lawn suit',
      description: 'Unstitched',
      visibleTo: ['RETAILER'],
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://platform.example.com/platform/marketplace/v1/listings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
        body: expect.stringContaining('"externalRef":"p1"'),
      }),
    );
  });

  it('surfaces a non-OK response as ServiceUnavailableException, never the raw upstream body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });
    await expect(service.listMine()).rejects.toThrow(ServiceUnavailableException);
  });

  it('surfaces a network failure as ServiceUnavailableException', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.listMine()).rejects.toThrow(ServiceUnavailableException);
  });
});

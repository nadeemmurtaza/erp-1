import { UnauthorizedException } from '@nestjs/common';
import { TradingPartnerPortalController } from './trading-partner-portal.controller';

/**
 * The Authorization-header parsing a partner's system depends on (WO-18.2) —
 * a malformed or missing header must never reach `verifyInboundKey()` with
 * `undefined`, since that would read as "no key presented" rather than the
 * caller's mistake being surfaced clearly.
 */
describe('TradingPartnerPortalController', () => {
  let controller: TradingPartnerPortalController;
  let tradingPartners: any;

  beforeEach(() => {
    tradingPartners = {
      verifyInboundKey: jest.fn().mockResolvedValue({ id: 'tp1', kind: 'CUSTOMER' }),
      getLiveStock: jest.fn().mockResolvedValue([{ sku: 'SKU-1', found: true, stock: 5, priceMinor: 1000 }]),
    };
    controller = new TradingPartnerPortalController(tradingPartners);
  });

  it('refuses a missing Authorization header before calling the service', async () => {
    await expect(controller.stock(undefined, 'SKU-1')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tradingPartners.verifyInboundKey).not.toHaveBeenCalled();
  });

  it('refuses an Authorization header that is not a Bearer token', async () => {
    await expect(controller.stock('Basic abc123', 'SKU-1')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tradingPartners.verifyInboundKey).not.toHaveBeenCalled();
  });

  it('extracts the raw key after "Bearer " and passes it through', async () => {
    await controller.stock('Bearer tp_therawkey', 'SKU-1');

    expect(tradingPartners.verifyInboundKey).toHaveBeenCalledWith('tp_therawkey');
  });

  it('splits a comma-separated sku list and trims whitespace, dropping empties', async () => {
    await controller.stock('Bearer tp_therawkey', ' SKU-1 ,SKU-2,, SKU-3');

    expect(tradingPartners.getLiveStock).toHaveBeenCalledWith(
      { id: 'tp1', kind: 'CUSTOMER' },
      ['SKU-1', 'SKU-2', 'SKU-3'],
    );
  });

  it('asks for an empty list rather than throwing when no skus query param is given', async () => {
    await controller.stock('Bearer tp_therawkey', undefined);

    expect(tradingPartners.getLiveStock).toHaveBeenCalledWith({ id: 'tp1', kind: 'CUSTOMER' }, []);
  });
});

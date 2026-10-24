import { UnauthorizedException } from '@nestjs/common';
import { TradingPartnerPortalController } from './trading-partner-portal.controller';
import type { SubmitPartnerFactDto } from './dto/partner-fact.dto';

/**
 * The Authorization-header parsing a partner's system depends on (WO-18.2) —
 * a malformed or missing header must never reach `verifyInboundKey()` with
 * `undefined`, since that would read as "no key presented" rather than the
 * caller's mistake being surfaced clearly.
 */
describe('TradingPartnerPortalController', () => {
  let controller: TradingPartnerPortalController;
  let tradingPartners: any;
  let factInbox: { accept: jest.Mock };

  beforeEach(() => {
    tradingPartners = {
      verifyInboundKey: jest.fn().mockResolvedValue({ id: 'tp1', kind: 'CUSTOMER' }),
      getLiveStock: jest.fn().mockResolvedValue([{ sku: 'SKU-1', found: true, stock: 5, priceMinor: 1000 }]),
      acceptConnection: jest.fn().mockResolvedValue({ id: 'tp1', name: 'Acme', kind: 'CUSTOMER', status: 'ACTIVE' }),
    };
    factInbox = { accept: jest.fn().mockResolvedValue({ factId: 'f1', status: 'RECEIVED', duplicate: false }) };
    controller = new TradingPartnerPortalController(tradingPartners, factInbox as any);
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

  describe('submitFact — WO-213.1', () => {
    const dto = { factId: 'f1', type: 'sale.dispatched' } as SubmitPartnerFactDto;

    it('refuses a missing Authorization header before anything is stored', async () => {
      await expect(controller.submitFact(undefined, dto)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(tradingPartners.verifyInboundKey).not.toHaveBeenCalled();
      expect(factInbox.accept).not.toHaveBeenCalled();
    });

    it('does not store anything when the key is refused (unknown, suspended or expired)', async () => {
      tradingPartners.verifyInboundKey.mockRejectedValue(new UnauthorizedException('This API key has expired.'));

      await expect(controller.submitFact('Bearer tp_old', dto)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(factInbox.accept).not.toHaveBeenCalled();
    });

    it('hands the VERIFIED partner, not anything from the body, to the inbox and returns its receipt', async () => {
      const result = await controller.submitFact('Bearer tp_therawkey', dto);

      expect(tradingPartners.verifyInboundKey).toHaveBeenCalledWith('tp_therawkey');
      expect(factInbox.accept).toHaveBeenCalledWith({ id: 'tp1', kind: 'CUSTOMER' }, dto);
      expect(result).toEqual({ factId: 'f1', status: 'RECEIVED', duplicate: false });
    });
  });

  describe('accept', () => {
    it('passes the token and role through and returns a trimmed-down summary', async () => {
      const result = await controller.accept({ token: 'tpi_raw', role: 'RETAILER' });

      expect(tradingPartners.acceptConnection).toHaveBeenCalledWith('tpi_raw', 'RETAILER');
      expect(result).toEqual({ id: 'tp1', name: 'Acme', kind: 'CUSTOMER', status: 'ACTIVE' });
    });
  });
});

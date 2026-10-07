import { UnauthorizedException } from '@nestjs/common';
import { MarketplaceWebhookGuard } from './marketplace-webhook.guard';

function contextWithHeader(header: string | undefined) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-marketplace-api-key': header } }),
    }),
  } as any;
}

describe('MarketplaceWebhookGuard — 166-unified-product-reference-registry.md WO-166.4', () => {
  let config: any;
  let guard: MarketplaceWebhookGuard;

  beforeEach(() => {
    config = { get: jest.fn().mockReturnValue('the-configured-key') };
    guard = new MarketplaceWebhookGuard(config);
  });

  it('accepts a presented key matching the configured one', () => {
    expect(guard.canActivate(contextWithHeader('the-configured-key'))).toBe(true);
  });

  it('refuses a wrong key', () => {
    expect(() => guard.canActivate(contextWithHeader('wrong-key'))).toThrow(UnauthorizedException);
  });

  it('refuses a missing header', () => {
    expect(() => guard.canActivate(contextWithHeader(undefined))).toThrow(UnauthorizedException);
  });

  it('refuses every delivery when this tenant has no key configured — the absent-collaborator case', () => {
    config.get.mockReturnValue(undefined);
    expect(() => guard.canActivate(contextWithHeader('anything'))).toThrow(UnauthorizedException);
  });
});

import { PaymentFeedSource } from './payment-feed.source';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import type { FeedRegistryService } from '../../../core/feed/feed-registry.service';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { id: 'u1', roles: [], permissions: [], email: null, phone: null, ...overrides };
}

function makeRegistry() {
  return { register: jest.fn() } as unknown as FeedRegistryService;
}

describe('PaymentFeedSource — WO-58.2', () => {
  it('registers itself in onModuleInit', () => {
    const registry = makeRegistry();
    const source = new PaymentFeedSource({} as any, registry);
    source.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(source);
  });

  it('only ever queries PAID payments — a pending or failed attempt is not a sale', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const source = new PaymentFeedSource({ payment: { findMany } } as any, makeRegistry());

    await source.fetchRecent(makeUser(), null, undefined, 20);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'PAID' }) }));
  });

  it("maps a paid payment into a FeedEntry, resolving locationId from its own order — never a default", async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'pay1', amount: 450000, createdAt: new Date('2026-01-01'), order: { id: 'ord1', number: 'YSN-2026-0412', locationId: 'loc1' } },
    ]);
    const source = new PaymentFeedSource({ payment: { findMany } } as any, makeRegistry());

    const result = await source.fetchRecent(makeUser(), null, undefined, 20);

    expect(result).toEqual([
      {
        id: 'payment:pay1',
        kind: 'PAYMENT',
        summary: expect.stringContaining('YSN-2026-0412'),
        occurredAt: new Date('2026-01-01'),
        href: '/admin/orders/ord1',
        locationId: 'loc1',
      },
    ]);
  });

  it('scopes to locationId via its own order, when given', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const source = new PaymentFeedSource({ payment: { findMany } } as any, makeRegistry());

    await source.fetchRecent(makeUser(), null, 'loc1', 20);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ order: { locationId: 'loc1' } }) }));
  });

  it('resolveCursor looks up the named payment id\'s own createdAt, stripping the "payment:" prefix', async () => {
    const findUnique = jest.fn().mockResolvedValue({ createdAt: new Date('2026-01-05') });
    const source = new PaymentFeedSource({ payment: { findUnique } } as any, makeRegistry());

    const result = await source.resolveCursor('payment:pay1');

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'pay1' }, select: { createdAt: true } });
    expect(result).toEqual(new Date('2026-01-05'));
  });
});

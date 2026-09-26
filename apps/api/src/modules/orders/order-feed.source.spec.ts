import { OrderFeedSource } from './order-feed.source';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import type { FeedRegistryService } from '../../core/feed/feed-registry.service';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { id: 'u1', roles: [], permissions: [], email: null, phone: null, ...overrides };
}

function makeRegistry() {
  return { register: jest.fn() } as unknown as FeedRegistryService;
}

describe('OrderFeedSource — WO-58.2', () => {
  it('registers itself in onModuleInit', () => {
    const registry = makeRegistry();
    const source = new OrderFeedSource({} as any, registry);
    source.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(source);
  });

  it('maps a placed order into a FeedEntry pointing at the real order screen', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'ord1', number: 'YSN-2026-0412', grandTotal: 450000, placedAt: new Date('2026-01-01'), locationId: 'loc1' },
    ]);
    const source = new OrderFeedSource({ order: { findMany } } as any, makeRegistry());

    const result = await source.fetchRecent(makeUser(), null, undefined, 20);

    expect(result).toEqual([
      {
        id: 'order:ord1',
        kind: 'ORDER',
        summary: expect.stringContaining('YSN-2026-0412'),
        occurredAt: new Date('2026-01-01'),
        href: '/admin/orders/ord1',
        locationId: 'loc1',
      },
    ]);
  });

  it('scopes to locationId when given — never an implicit all-locations read', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const source = new OrderFeedSource({ order: { findMany } } as any, makeRegistry());

    await source.fetchRecent(makeUser(), null, 'loc1', 20);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ locationId: 'loc1' }) }));
  });

  it('filters to rows strictly newer than the resolved cursor', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const source = new OrderFeedSource({ order: { findMany } } as any, makeRegistry());
    const since = new Date('2026-01-01');

    await source.fetchRecent(makeUser(), since, undefined, 20);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ placedAt: { gt: since } }) }));
  });

  it('resolveCursor looks up the named order id\'s own placedAt, stripping the "order:" prefix', async () => {
    const findUnique = jest.fn().mockResolvedValue({ placedAt: new Date('2026-01-05') });
    const source = new OrderFeedSource({ order: { findUnique } } as any, makeRegistry());

    const result = await source.resolveCursor('order:ord1');

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'ord1' }, select: { placedAt: true } });
    expect(result).toEqual(new Date('2026-01-05'));
  });

  it('resolveCursor returns null for a stale cursor naming a deleted order', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const source = new OrderFeedSource({ order: { findUnique } } as any, makeRegistry());

    expect(await source.resolveCursor('order:gone')).toBeNull();
  });
});

import { PurchaseOrderFeedSource } from './purchase-order-feed.source';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import type { FeedRegistryService } from '../../../core/feed/feed-registry.service';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { id: 'u1', roles: [], permissions: [], email: null, phone: null, ...overrides };
}

function makeRegistry() {
  return { register: jest.fn() } as unknown as FeedRegistryService;
}

describe('PurchaseOrderFeedSource — WO-58.2', () => {
  it('registers itself in onModuleInit', () => {
    const registry = makeRegistry();
    const source = new PurchaseOrderFeedSource({} as any, registry);
    source.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(source);
  });

  it('never returns entries to a caller without purchasing.manage — the same gate purchasingSpend() enforces', async () => {
    const findMany = jest.fn();
    const source = new PurchaseOrderFeedSource({ purchaseOrder: { findMany } } as any, makeRegistry());

    const result = await source.fetchRecent(makeUser({ permissions: [] }), null, undefined, 20);

    expect(findMany).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('never returns entries for a location-scoped call — a PurchaseOrder carries no locationId of its own', async () => {
    const findMany = jest.fn();
    const source = new PurchaseOrderFeedSource({ purchaseOrder: { findMany } } as any, makeRegistry());

    const result = await source.fetchRecent(makeUser({ permissions: ['purchasing.manage'] }), null, 'loc1', 20);

    expect(findMany).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('maps a purchase order into a FeedEntry with locationId null, never a guessed default', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'po1', number: 'PO-0099', total: 4500000, createdAt: new Date('2026-01-01') }]);
    const source = new PurchaseOrderFeedSource({ purchaseOrder: { findMany } } as any, makeRegistry());

    const result = await source.fetchRecent(makeUser({ permissions: ['purchasing.manage'] }), null, undefined, 20);

    expect(result).toEqual([
      {
        id: 'po:po1',
        kind: 'PURCHASE_ORDER',
        summary: expect.stringContaining('PO-0099'),
        occurredAt: new Date('2026-01-01'),
        href: '/admin/purchase-orders/po1',
        locationId: null,
      },
    ]);
  });

  it('resolveCursor looks up the named PO id\'s own createdAt, stripping the "po:" prefix', async () => {
    const findUnique = jest.fn().mockResolvedValue({ createdAt: new Date('2026-01-05') });
    const source = new PurchaseOrderFeedSource({ purchaseOrder: { findUnique } } as any, makeRegistry());

    const result = await source.resolveCursor('po:po1');

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'po1' }, select: { createdAt: true } });
    expect(result).toEqual(new Date('2026-01-05'));
  });
});

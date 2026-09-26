import { FeedRegistryService } from './feed-registry.service';
import type { FeedEntry, FeedSource } from './feed-source';
import type { AuthenticatedUser } from '../auth/auth.constants';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { id: 'u1', roles: [], permissions: [], email: null, phone: null, ...overrides };
}

function makeSource(overrides: Partial<FeedSource> & Pick<FeedSource, 'id' | 'kind' | 'entryPrefix'>): FeedSource {
  return { fetchRecent: jest.fn(async () => []), resolveCursor: jest.fn(async () => null), ...overrides };
}

function makeEntry(overrides: Partial<FeedEntry> & Pick<FeedEntry, 'id' | 'kind' | 'occurredAt'>): FeedEntry {
  return { summary: 's', href: '/x', locationId: null, ...overrides };
}

describe('FeedRegistryService — WO-58.2', () => {
  let registry: FeedRegistryService;

  beforeEach(() => {
    registry = new FeedRegistryService();
  });

  it('throws, naming the duplicate id, when two sources register the same id', () => {
    registry.register(makeSource({ id: 'orders.feed', kind: 'ORDER', entryPrefix: 'order' }));
    expect(() => registry.register(makeSource({ id: 'orders.feed', kind: 'ORDER', entryPrefix: 'order' }))).toThrow(/orders\.feed/);
  });

  it('merges entries from every registered source, newest first, and caps at the requested limit', async () => {
    const oldest = makeEntry({ id: 'order:1', kind: 'ORDER', occurredAt: new Date('2026-01-01') });
    const middle = makeEntry({ id: 'payment:1', kind: 'PAYMENT', occurredAt: new Date('2026-01-02') });
    const newest = makeEntry({ id: 'order:2', kind: 'ORDER', occurredAt: new Date('2026-01-03') });

    registry.register(makeSource({ id: 's1', kind: 'ORDER', entryPrefix: 'order', fetchRecent: jest.fn(async () => [oldest, newest]) }));
    registry.register(makeSource({ id: 's2', kind: 'PAYMENT', entryPrefix: 'payment', fetchRecent: jest.fn(async () => [middle]) }));

    const result = await registry.collect(makeUser(), null, undefined, 2);

    expect(result.items.map((e) => e.id)).toEqual(['order:2', 'payment:1']);
    expect(result.items).toHaveLength(2);
  });

  it('one source throwing does not blank the feed — its kind is reported unavailable, others still render', async () => {
    const okEntry = makeEntry({ id: 'order:1', kind: 'ORDER', occurredAt: new Date() });
    registry.register(
      makeSource({ id: 'broken', kind: 'PURCHASE_ORDER', entryPrefix: 'po', fetchRecent: jest.fn(async () => { throw new Error('down'); }) }),
    );
    registry.register(makeSource({ id: 'good', kind: 'ORDER', entryPrefix: 'order', fetchRecent: jest.fn(async () => [okEntry]) }));

    const result = await registry.collect(makeUser(), null, undefined);

    expect(result.items).toEqual([okEntry]);
    expect(result.unavailableKinds).toEqual(['PURCHASE_ORDER']);
  });

  it('resolves sinceId by asking the source whose prefix matches, and passes the resolved Date to every source', async () => {
    const resolveCursor = jest.fn(async () => new Date('2026-02-01'));
    const orderSource = makeSource({ id: 'orders.feed', kind: 'ORDER', entryPrefix: 'order', resolveCursor });
    const paymentFetch = jest.fn(async () => []);
    registry.register(orderSource);
    registry.register(makeSource({ id: 'payments.feed', kind: 'PAYMENT', entryPrefix: 'payment', fetchRecent: paymentFetch }));

    await registry.collect(makeUser(), 'order:abc123', undefined);

    expect(resolveCursor).toHaveBeenCalledWith('order:abc123');
    expect(paymentFetch).toHaveBeenCalledWith(expect.anything(), new Date('2026-02-01'), undefined, expect.any(Number));
  });

  it('a cursor naming no registered source resolves to null (fetch the most recent page), never throws', async () => {
    const fetchRecent = jest.fn(async () => []);
    registry.register(makeSource({ id: 'orders.feed', kind: 'ORDER', entryPrefix: 'order', fetchRecent }));

    await expect(registry.collect(makeUser(), 'unknown-prefix:1', undefined)).resolves.toBeDefined();
    expect(fetchRecent).toHaveBeenCalledWith(expect.anything(), null, undefined, expect.any(Number));
  });

  it('collects from zero sources without error, rendering an empty feed', async () => {
    const result = await registry.collect(makeUser(), null, undefined);
    expect(result.items).toEqual([]);
    expect(result.unavailableKinds).toEqual([]);
  });
});

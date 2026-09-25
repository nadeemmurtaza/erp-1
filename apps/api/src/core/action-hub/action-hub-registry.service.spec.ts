import { ActionHubRegistryService } from './action-hub-registry.service';
import type { ActionHubSource, ActionItem } from './action-hub-source';
import type { AuthenticatedUser } from '../auth/auth.constants';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { id: 'u1', roles: [], permissions: [], email: null, phone: null, ...overrides };
}

function makeSource(overrides: Partial<ActionHubSource> & Pick<ActionHubSource, 'id' | 'kind'>): ActionHubSource {
  return { fetchFor: jest.fn(async () => []), ...overrides };
}

describe('ActionHubRegistryService', () => {
  let registry: ActionHubRegistryService;

  beforeEach(() => {
    registry = new ActionHubRegistryService();
  });

  it('throws, naming the duplicate id, when two sources register the same id', () => {
    registry.register(makeSource({ id: 'leave', kind: 'LEAVE_REQUEST' }));
    expect(() => registry.register(makeSource({ id: 'leave', kind: 'OTHER' }))).toThrow(/leave/);
  });

  it('registering a new source needs no change to collect() — it just appears', async () => {
    const item: ActionItem = {
      id: 'x:1',
      kind: 'TEST',
      subjectEmployeeName: 'A',
      summary: 'test item',
      dueBy: null,
      href: '/admin/test',
      permission: 'analytics.view',
    };
    registry.register(makeSource({ id: 'test-source', kind: 'TEST', fetchFor: jest.fn(async () => [item]) }));

    const result = await registry.collect(makeUser());

    expect(result.items).toEqual([item]);
    expect(registry.sourceCount).toBe(1);
  });

  it('merges items from every registered source, sorted by dueBy (no deadline last)', async () => {
    const soon: ActionItem = { id: 'a', kind: 'A', subjectEmployeeName: 'A', summary: 's', dueBy: new Date('2026-01-02'), href: '/a', permission: 'analytics.view' };
    const later: ActionItem = { id: 'b', kind: 'B', subjectEmployeeName: 'B', summary: 's', dueBy: new Date('2026-01-05'), href: '/b', permission: 'analytics.view' };
    const noDeadline: ActionItem = { id: 'c', kind: 'C', subjectEmployeeName: 'C', summary: 's', dueBy: null, href: '/c', permission: 'analytics.view' };

    registry.register(makeSource({ id: 's1', kind: 'A', fetchFor: jest.fn(async () => [later, noDeadline]) }));
    registry.register(makeSource({ id: 's2', kind: 'B', fetchFor: jest.fn(async () => [soon]) }));

    const result = await registry.collect(makeUser());

    expect(result.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('one source throwing does not blank the whole hub — its kind is reported unavailable, others still render', async () => {
    const goodItem: ActionItem = { id: 'ok:1', kind: 'GOOD', subjectEmployeeName: 'A', summary: 's', dueBy: null, href: '/ok', permission: 'analytics.view' };
    registry.register(makeSource({ id: 'broken', kind: 'BROKEN', fetchFor: jest.fn(async () => { throw new Error('down'); }) }));
    registry.register(makeSource({ id: 'good', kind: 'GOOD', fetchFor: jest.fn(async () => [goodItem]) }));

    const result = await registry.collect(makeUser());

    expect(result.items).toEqual([goodItem]);
    expect(result.unavailableKinds).toEqual(['BROKEN']);
  });

  it('logs a non-Error throw the same way, without crashing', async () => {
    registry.register(makeSource({ id: 'broken', kind: 'BROKEN', fetchFor: jest.fn(async () => { throw 'not an Error instance'; }) }));

    const result = await registry.collect(makeUser());

    expect(result.items).toEqual([]);
    expect(result.unavailableKinds).toEqual(['BROKEN']);
  });

  it('collects from zero sources without error, rendering an empty hub', async () => {
    const result = await registry.collect(makeUser());
    expect(result.items).toEqual([]);
    expect(result.unavailableKinds).toEqual([]);
  });
});

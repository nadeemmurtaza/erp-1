import { ReplicationRegistry } from './replication.registry';

describe('ReplicationRegistry — WO-20.1', () => {
  let registry: ReplicationRegistry;

  beforeEach(() => {
    registry = new ReplicationRegistry();
  });

  it('returns undefined for an entity nobody registered', () => {
    expect(registry.describe('Order')).toBeUndefined();
  });

  it('returns what was registered', () => {
    const apply = jest.fn();
    registry.register('Order', { dataClass: 'FACT', direction: 'UP', apply });

    expect(registry.describe('Order')).toEqual({ dataClass: 'FACT', direction: 'UP', apply });
  });

  it('refuses to register the same entity twice', () => {
    registry.register('Product', { dataClass: 'POLICY', direction: 'DOWN', apply: jest.fn() });

    expect(() => registry.register('Product', { dataClass: 'POLICY', direction: 'DOWN', apply: jest.fn() })).toThrow(
      /already registered/,
    );
  });
});

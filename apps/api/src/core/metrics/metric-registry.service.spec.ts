import { Global, Injectable, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { PermissionKey } from '@newax/shared';
import { MetricRegistryService } from './metric-registry.service';
import { MetricsModule } from './metrics.module';
import { SettingsService } from '../settings/settings.service';
import type { MetricContext, MetricProvider } from './metric-provider';

function makeContext(overrides: Partial<MetricContext> = {}): MetricContext {
  return {
    from: new Date('2026-08-01T00:00:00.000Z'),
    to: new Date('2026-08-31T00:00:00.000Z'),
    prevFrom: new Date('2026-07-02T00:00:00.000Z'),
    prevTo: new Date('2026-08-01T00:00:00.000Z'),
    permissions: ['analytics.view'] as PermissionKey[],
    ...overrides,
  };
}

function makeProvider(overrides: Partial<MetricProvider> & Pick<MetricProvider, 'id' | 'keys'>): MetricProvider {
  return {
    permissions: [],
    collect: jest.fn(async () => ({})),
    ...overrides,
  };
}

describe('MetricRegistryService', () => {
  let service: MetricRegistryService;
  let settings: { get: jest.Mock };

  beforeEach(async () => {
    settings = { get: jest.fn().mockResolvedValue(60) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricRegistryService, { provide: SettingsService, useValue: settings }],
    }).compile();

    service = module.get(MetricRegistryService);
  });

  describe('register', () => {
    it('throws, naming both provider ids, when two providers claim the same key', () => {
      service.register(makeProvider({ id: 'orders.metrics', keys: ['ordersToday', 'revenueToday'] }));

      expect(() => service.register(makeProvider({ id: 'sales.metrics', keys: ['revenueToday'] }))).toThrow(
        /orders\.metrics.*sales\.metrics|sales\.metrics.*orders\.metrics/,
      );
    });

    it('allows two providers with disjoint key sets', () => {
      service.register(makeProvider({ id: 'orders.metrics', keys: ['ordersToday'] }));
      expect(() => service.register(makeProvider({ id: 'sales.metrics', keys: ['revenueToday'] }))).not.toThrow();
    });
  });

  describe('collect — permission gating', () => {
    it('never invokes a provider whose permission the caller lacks (invoke-then-filter would leak work and timing)', async () => {
      const collect = jest.fn(async () => ({ cost: { value: 1, previous: null, unit: 'paisa' as const } }));
      service.register(
        makeProvider({ id: 'inventory.metrics', keys: ['cost'], permissions: ['inventory.view_cost'] as PermissionKey[], collect }),
      );

      const result = await service.collect(makeContext({ permissions: ['analytics.view'] as PermissionKey[] }), ['cost']);

      expect(collect).not.toHaveBeenCalled();
      expect(result).toEqual({});
    });

    it('invokes a provider once the caller holds one of its required permissions', async () => {
      const collect = jest.fn(async () => ({ cost: { value: 5, previous: 4, unit: 'paisa' as const } }));
      service.register(
        makeProvider({ id: 'inventory.metrics', keys: ['cost'], permissions: ['inventory.view_cost'] as PermissionKey[], collect }),
      );

      const result = await service.collect(
        makeContext({ permissions: ['inventory.view_cost'] as PermissionKey[] }),
        ['cost'],
      );

      expect(collect).toHaveBeenCalledTimes(1);
      expect(result.cost).toEqual({ value: 5, previous: 4, unit: 'paisa' });
    });

    it('falls back to requiring analytics.view when a provider declares no permissions', async () => {
      const collect = jest.fn(async () => ({ orders: { value: 1, previous: 0, unit: 'count' as const } }));
      service.register(makeProvider({ id: 'orders.metrics', keys: ['orders'], permissions: [], collect }));

      const denied = await service.collect(makeContext({ permissions: [] as PermissionKey[] }), ['orders']);
      expect(collect).not.toHaveBeenCalled();
      expect(denied).toEqual({});

      const allowed = await service.collect(makeContext({ permissions: ['analytics.view'] as PermissionKey[] }), ['orders']);
      expect(collect).toHaveBeenCalledTimes(1);
      expect(allowed.orders.value).toBe(1);
    });
  });

  describe('collect — failure isolation', () => {
    it('omits only the throwing provider\'s keys; the rest of the batch still returns', async () => {
      const failing = makeProvider({
        id: 'purchasing.metrics',
        keys: ['spend'],
        collect: jest.fn(async () => {
          throw new Error('boom');
        }),
      });
      const healthy = makeProvider({
        id: 'orders.metrics',
        keys: ['orders'],
        collect: jest.fn(async () => ({ orders: { value: 3, previous: 2, unit: 'count' as const } })),
      });
      service.register(failing);
      service.register(healthy);

      const result = await service.collect(makeContext(), ['spend', 'orders']);

      expect(result.spend).toBeUndefined();
      expect(result.orders).toEqual({ value: 3, previous: 2, unit: 'count' });
    });

    it('logs a non-Error throw (e.g. a rejected string) the same way, without crashing', async () => {
      const failing = makeProvider({
        id: 'broken.metrics',
        keys: ['broken'],
        collect: jest.fn(async () => {
          throw 'not an Error instance';
        }),
      });
      service.register(failing);

      const result = await service.collect(makeContext(), ['broken']);
      expect(result).toEqual({});
    });

    it('runs eligible providers concurrently, not sequentially', async () => {
      const order: string[] = [];
      const slow = makeProvider({
        id: 'slow.metrics',
        keys: ['a'],
        collect: jest.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          order.push('slow');
          return { a: { value: 1, previous: null, unit: 'count' as const } };
        }),
      });
      const fast = makeProvider({
        id: 'fast.metrics',
        keys: ['b'],
        collect: jest.fn(async () => {
          order.push('fast');
          return { b: { value: 2, previous: null, unit: 'count' as const } };
        }),
      });
      service.register(slow);
      service.register(fast);

      await service.collect(makeContext(), ['a', 'b']);

      expect(order).toEqual(['fast', 'slow']); // the fast one resolves first only if they ran concurrently
    });
  });

  describe('collect — caching', () => {
    it('serves a second identical call from cache without re-invoking providers', async () => {
      const collect = jest.fn(async () => ({ orders: { value: 1, previous: 0, unit: 'count' as const } }));
      service.register(makeProvider({ id: 'orders.metrics', keys: ['orders'], collect }));

      await service.collect(makeContext(), ['orders']);
      await service.collect(makeContext(), ['orders']);

      expect(collect).toHaveBeenCalledTimes(1);
    });

    it('never serves one permission fingerprint\'s cache entry to a different one', async () => {
      const collect = jest.fn(async (ctx: MetricContext) => ({
        cost: { value: ctx.permissions.includes('inventory.view_cost' as PermissionKey) ? 100 : 0, previous: null, unit: 'paisa' as const },
      }));
      service.register(
        makeProvider({ id: 'inventory.metrics', keys: ['cost'], permissions: ['inventory.view_cost'] as PermissionKey[], collect }),
      );

      const admin = await service.collect(
        makeContext({ permissions: ['inventory.view_cost', 'analytics.view'] as PermissionKey[] }),
        ['cost'],
      );
      const staff = await service.collect(makeContext({ permissions: ['analytics.view'] as PermissionKey[] }), ['cost']);

      expect(admin.cost.value).toBe(100);
      expect(staff).toEqual({}); // never invoked, never leaked the admin's cached figure
      expect(collect).toHaveBeenCalledTimes(1);
    });

    it('treats a different bucket as a different cache entry', async () => {
      const collect = jest.fn(async () => ({ orders: { value: 1, previous: 0, unit: 'count' as const } }));
      service.register(makeProvider({ id: 'orders.metrics', keys: ['orders'], collect }));

      await service.collect(makeContext(), ['orders'], 'day');
      await service.collect(makeContext(), ['orders'], 'week');

      expect(collect).toHaveBeenCalledTimes(2);
    });

    it('treats a different wanted-key set as a different cache entry', async () => {
      const collect = jest.fn(async () => ({
        orders: { value: 1, previous: 0, unit: 'count' as const },
        revenue: { value: 2, previous: 1, unit: 'paisa' as const },
      }));
      service.register(makeProvider({ id: 'orders.metrics', keys: ['orders', 'revenue'], collect }));

      await service.collect(makeContext(), ['orders']);
      await service.collect(makeContext(), ['orders', 'revenue']);

      expect(collect).toHaveBeenCalledTimes(2);
    });

    it('is order-independent: [orders, revenue] and [revenue, orders] hit the same cache entry', async () => {
      const collect = jest.fn(async () => ({
        orders: { value: 1, previous: 0, unit: 'count' as const },
        revenue: { value: 2, previous: 1, unit: 'paisa' as const },
      }));
      service.register(makeProvider({ id: 'orders.metrics', keys: ['orders', 'revenue'], collect }));

      await service.collect(makeContext(), ['orders', 'revenue']);
      await service.collect(makeContext(), ['revenue', 'orders']);

      expect(collect).toHaveBeenCalledTimes(1);
    });

    it('disables the cache entirely when the setting is 0', async () => {
      settings.get.mockResolvedValue(0);
      const collect = jest.fn(async () => ({ orders: { value: 1, previous: 0, unit: 'count' as const } }));
      service.register(makeProvider({ id: 'orders.metrics', keys: ['orders'], collect }));

      await service.collect(makeContext(), ['orders']);
      await service.collect(makeContext(), ['orders']);

      expect(collect).toHaveBeenCalledTimes(2);
    });
  });

  describe('global injection', () => {
    it('is injectable into a module that imports nothing of its own', async () => {
      @Injectable()
      class Consumer {
        constructor(public readonly registry: MetricRegistryService) {}
      }

      @Module({ providers: [Consumer] })
      class ConsumerModule {}

      // Mirrors production: SettingsModule is @Global too, wired once in
      // core.module.ts, so MetricsModule never imports it directly.
      @Global()
      @Module({ providers: [{ provide: SettingsService, useValue: settings }], exports: [SettingsService] })
      class FakeSettingsModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [FakeSettingsModule, MetricsModule, ConsumerModule],
      }).compile();

      const consumer = moduleRef.get(Consumer);
      expect(consumer.registry).toBeInstanceOf(MetricRegistryService);
    });
  });
});

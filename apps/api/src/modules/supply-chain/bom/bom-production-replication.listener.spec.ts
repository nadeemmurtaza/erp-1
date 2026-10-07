import { BomProductionReplicationListener } from './bom-production-replication.listener';
import { ReplicationRegistry } from '../../../core/replication/replication.registry';
import { ReplicationLogService } from '../../../core/replication/replication-log.service';

describe('BomProductionReplicationListener — WO-23.3c/e, ADR-021', () => {
  let listener: BomProductionReplicationListener;
  let registry: any;
  let log: any;

  beforeEach(() => {
    registry = { register: jest.fn() };
    log = { append: jest.fn().mockResolvedValue(undefined) };
    listener = new BomProductionReplicationListener(registry as ReplicationRegistry, log as ReplicationLogService);
  });

  describe('onModuleInit', () => {
    it('registers BomProductionRun as a FACT entity flowing UP', () => {
      listener.onModuleInit();

      expect(registry.register).toHaveBeenCalledWith(
        'BomProductionRun',
        expect.objectContaining({ dataClass: 'FACT', direction: 'UP', apply: expect.any(Function) }),
      );
    });

    it('quarantines every incoming run — no BrandPolicy switch governs branch-local manufacturing, and chain-wide consolidation is not built yet', () => {
      listener.onModuleInit();
      const descriptor = registry.register.mock.calls[0][1];

      expect(() => descriptor.apply()).toThrow(/not built yet/);
    });
  });

  describe('onBomProductionCompleted', () => {
    it('logs the payload BomProductionCompleted already published, unchanged, dated at when the run finished', async () => {
      const payload = {
        runId: 'run1',
        number: 'PROD-1',
        recipeId: 'recipe1',
        variantId: 'v1',
        quantityProduced: 10,
        producedUnitCost: 500,
        operatorId: null,
        scopeLevel: 'BRAND' as const,
        originNodeId: null,
        producedAtIso: '2026-01-15T10:00:00.000Z',
      };

      await listener.onBomProductionCompleted(payload);

      expect(log.append).toHaveBeenCalledWith(
        'BomProductionRun',
        'run1',
        'UPSERT',
        payload,
        1,
        new Date('2026-01-15T10:00:00.000Z'),
      );
    });
  });
});

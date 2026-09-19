import { ReplicationApplyService } from './replication-apply.service';
import { ReplicationRegistry } from './replication.registry';
import { ReplicationQuarantineService } from './replication-quarantine.service';

describe('ReplicationApplyService — WO-20.1', () => {
  let service: ReplicationApplyService;
  let registry: ReplicationRegistry;
  let quarantine: any;

  const RECORD = {
    originNodeId: 'branch-lhr01',
    sequence: 7n,
    entity: 'Order',
    entityId: 'ord1',
    op: 'UPSERT' as const,
    payload: { total: 100 },
    schemaVersion: 1,
    occurredAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    registry = new ReplicationRegistry();
    quarantine = { quarantine: jest.fn().mockResolvedValue({}) };
    service = new ReplicationApplyService(registry, quarantine as ReplicationQuarantineService);
  });

  it('quarantines a record for an entity nobody registered, without throwing', async () => {
    await expect(service.apply(RECORD)).resolves.toBeUndefined();

    expect(quarantine.quarantine).toHaveBeenCalledWith(RECORD, expect.stringMatching(/No applier registered/));
  });

  it('calls the registered applier with the record broken out into its fields', async () => {
    const apply = jest.fn().mockResolvedValue(undefined);
    registry.register('Order', { dataClass: 'FACT', direction: 'UP', apply });

    await service.apply(RECORD);

    expect(apply).toHaveBeenCalledWith({
      entityId: 'ord1',
      op: 'UPSERT',
      payload: { total: 100 },
      schemaVersion: 1,
      originNodeId: 'branch-lhr01',
      occurredAt: RECORD.occurredAt,
    });
    expect(quarantine.quarantine).not.toHaveBeenCalled();
  });

  it('quarantines rather than throws when the registered applier fails', async () => {
    registry.register('Order', {
      dataClass: 'FACT',
      direction: 'UP',
      apply: jest.fn().mockRejectedValue(new Error('parent order not found')),
    });

    await expect(service.apply(RECORD)).resolves.toBeUndefined();

    expect(quarantine.quarantine).toHaveBeenCalledWith(RECORD, 'parent order not found');
  });
});

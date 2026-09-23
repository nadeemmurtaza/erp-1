import { GoodsReceiptReplicationListener } from './goods-receipt-replication.listener';
import { ReplicationRegistry } from '../../core/replication/replication.registry';
import { ReplicationLogService } from '../../core/replication/replication-log.service';
import { PolicyQuarantineService } from '../../core/replication/policy-quarantine.service';
import { BranchPolicyRegistry } from '../../core/extension-points/branch-policy.registry';

describe('GoodsReceiptReplicationListener — WO-23.3c/e, RETAIL-ERP.md R2/R9/R13, ADR-023', () => {
  let listener: GoodsReceiptReplicationListener;
  let registry: any;
  let log: any;
  let policyQuarantine: any;
  let branchPolicy: any;

  beforeEach(() => {
    registry = { register: jest.fn() };
    log = { append: jest.fn().mockResolvedValue(undefined) };
    policyQuarantine = { quarantine: jest.fn().mockResolvedValue({ id: 'q1' }) };
    branchPolicy = { allowsBranchLocalPurchasingForNode: jest.fn() };
    listener = new GoodsReceiptReplicationListener(
      registry as ReplicationRegistry,
      log as ReplicationLogService,
      policyQuarantine as PolicyQuarantineService,
      branchPolicy as BranchPolicyRegistry,
    );
  });

  describe('onModuleInit', () => {
    it('registers GoodsReceipt as a FACT entity flowing UP', () => {
      listener.onModuleInit();

      expect(registry.register).toHaveBeenCalledWith(
        'GoodsReceipt',
        expect.objectContaining({ dataClass: 'FACT', direction: 'UP', apply: expect.any(Function) }),
      );
    });

    it('quarantines (via the apply-failure path) a BRAND-scope receipt — chain-wide consolidation is not built yet', async () => {
      listener.onModuleInit();
      const descriptor = registry.register.mock.calls[0][1];

      await expect(
        descriptor.apply({
          entityId: 'gr1',
          op: 'UPSERT',
          payload: { scopeLevel: 'BRAND' },
          schemaVersion: 1,
          originNodeId: 'brand-node',
          occurredAt: new Date(),
        }),
      ).rejects.toThrow(/not built yet/);
      expect(branchPolicy.allowsBranchLocalPurchasingForNode).not.toHaveBeenCalled();
    });

    it('quarantines (via the apply-failure path) a BRANCH-scope receipt whose brand allows local purchasing', async () => {
      branchPolicy.allowsBranchLocalPurchasingForNode.mockResolvedValue(true);
      listener.onModuleInit();
      const descriptor = registry.register.mock.calls[0][1];

      await expect(
        descriptor.apply({
          entityId: 'gr1',
          op: 'UPSERT',
          payload: { scopeLevel: 'BRANCH' },
          schemaVersion: 1,
          originNodeId: 'branch-lhr01',
          occurredAt: new Date(),
        }),
      ).rejects.toThrow(/not built yet/);
      expect(policyQuarantine.quarantine).not.toHaveBeenCalled();
    });

    it('accepts and quarantines into PolicyQuarantine — never throws — when the brand disallows branch-local purchasing', async () => {
      branchPolicy.allowsBranchLocalPurchasingForNode.mockResolvedValue(false);
      listener.onModuleInit();
      const descriptor = registry.register.mock.calls[0][1];
      const input = {
        entityId: 'gr1',
        op: 'UPSERT' as const,
        payload: { scopeLevel: 'BRANCH' as const },
        schemaVersion: 1,
        originNodeId: 'branch-lhr01',
        occurredAt: new Date(),
      };

      await expect(descriptor.apply(input)).resolves.toBeUndefined();

      expect(branchPolicy.allowsBranchLocalPurchasingForNode).toHaveBeenCalledWith('branch-lhr01');
      expect(policyQuarantine.quarantine).toHaveBeenCalledWith(
        expect.objectContaining({
          originNodeId: 'branch-lhr01',
          entity: 'GoodsReceipt',
          entityId: 'gr1',
          policyKey: 'allowBranchLocalPurchasing',
          retailBrandId: null,
          payload: input.payload,
          reason: expect.stringMatching(/branch-lhr01/),
        }),
      );
    });
  });

  describe('onGoodsReceived', () => {
    it('logs the payload GoodsReceived already published, unchanged, dated at when the goods were received', async () => {
      const payload = {
        goodsReceiptId: 'gr1',
        number: 'GRN-1',
        purchaseOrderId: 'po1',
        supplierId: 'sup1',
        scopeLevel: 'BRANCH' as const,
        originNodeId: 'branch-lhr01',
        receivedAtIso: '2026-01-15T10:00:00.000Z',
      };

      await listener.onGoodsReceived(payload);

      expect(log.append).toHaveBeenCalledWith(
        'GoodsReceipt',
        'gr1',
        'UPSERT',
        payload,
        1,
        new Date('2026-01-15T10:00:00.000Z'),
      );
    });
  });
});

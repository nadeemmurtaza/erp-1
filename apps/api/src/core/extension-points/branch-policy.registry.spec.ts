import { BranchPolicyRegistry } from './branch-policy.registry';

describe('BranchPolicyRegistry — WO-23.3b/c, ADR-022/ADR-023', () => {
  let registry: BranchPolicyRegistry;

  beforeEach(() => {
    registry = new BranchPolicyRegistry();
  });

  describe('allowsBranchLocalPurchasing (user-keyed)', () => {
    it('allows when no handler is registered — nothing claims a branch identity worth gating', async () => {
      await expect(registry.allowsBranchLocalPurchasing('user1')).resolves.toBe(true);
    });

    it('delegates to the registered handler once one exists', async () => {
      const handler = {
        allowsBranchLocalPurchasing: jest.fn().mockResolvedValue(false),
        allowsBranchLocalPurchasingForNode: jest.fn(),
      };
      registry.register(handler);

      await expect(registry.allowsBranchLocalPurchasing('user1')).resolves.toBe(false);
      expect(handler.allowsBranchLocalPurchasing).toHaveBeenCalledWith('user1');
    });
  });

  describe('allowsBranchLocalPurchasingForNode (node-keyed, replication-received)', () => {
    it('fails CLOSED when no handler is registered — the opposite default from the user-keyed method', async () => {
      await expect(registry.allowsBranchLocalPurchasingForNode('branch-lhr01')).resolves.toBe(false);
    });

    it('delegates to the registered handler once one exists', async () => {
      const handler = {
        allowsBranchLocalPurchasing: jest.fn(),
        allowsBranchLocalPurchasingForNode: jest.fn().mockResolvedValue(true),
      };
      registry.register(handler);

      await expect(registry.allowsBranchLocalPurchasingForNode('branch-lhr01')).resolves.toBe(true);
      expect(handler.allowsBranchLocalPurchasingForNode).toHaveBeenCalledWith('branch-lhr01');
    });
  });
});

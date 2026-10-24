import { Injectable, type OnModuleInit } from '@nestjs/common';
import { OnDomainEvent } from '../../../core/events/on-domain-event.decorator';
import { DomainEvent, type GoodsReceivedPayload } from '../../../core/events/domain-events';
import { ReplicationRegistry } from '../../../core/replication/replication.registry';
import { ReplicationLogService } from '../../../core/replication/replication-log.service';
import { PolicyQuarantineService } from '../../../core/replication/policy-quarantine.service';
import { BranchPolicyRegistry } from '../../../core/extension-points/branch-policy.registry';

const SCHEMA_VERSION = 1;
const POLICY_KEY = 'allowBranchLocalPurchasing';

/**
 * WO-23.3c/e (RETAIL-ERP.md R2/R9/R13, ADR-021/ADR-023) — `GoodsReceipt` is
 * one of R2's own named FACT examples ("goods receipt"), registered UP the
 * same way `OrderReplicationListener` registers `Order`.
 *
 * `apply()` draws exactly one distinction, on purpose: a `BRANCH`-scope
 * receipt whose brand disallows local purchasing is a GOVERNANCE exception
 * — accepted, never rejected (R5/R2), flagged into `PolicyQuarantine` for
 * review — while every other incoming receipt (ORG/BRAND scope, or a
 * BRANCH scope the brand DOES allow) throws, exactly like `Order.apply()`
 * does today: chain-wide purchasing consolidation — resolving this
 * receipt's own `purchaseOrderId`/`variantId` FKs against a parent
 * database that was never sent the `PurchaseOrder` this receipt belongs to
 * (ADR-021: `PurchaseOrder` is not itself replicated) — is not built yet,
 * and inventing a partial row to satisfy those FKs would be worse than
 * holding the fact in the existing apply-failure quarantine until it is.
 */
@Injectable()
export class GoodsReceiptReplicationListener implements OnModuleInit {
  constructor(
    private readonly registry: ReplicationRegistry,
    private readonly log: ReplicationLogService,
    private readonly policyQuarantine: PolicyQuarantineService,
    private readonly branchPolicy: BranchPolicyRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register('GoodsReceipt', {
      dataClass: 'FACT',
      direction: 'UP',
      apply: async (input) => {
        const payload = input.payload as GoodsReceivedPayload;

        if (payload.scopeLevel === 'BRANCH') {
          const allowed = await this.branchPolicy.allowsBranchLocalPurchasingForNode(input.originNodeId);
          if (!allowed) {
            await this.policyQuarantine.quarantine({
              originNodeId: input.originNodeId,
              entity: 'GoodsReceipt',
              entityId: input.entityId,
              policyKey: POLICY_KEY,
              retailBrandId: null,
              payload: input.payload,
              reason:
                `Branch "${input.originNodeId}" raised a GoodsReceipt at BRANCH scope, but its brand's ` +
                `${POLICY_KEY} switch is off or its Node carries no retailBrandId — accepted, held for review, never rejected (R9).`,
            });
            return;
          }
        }

        throw new Error(
          'Chain-wide purchasing consolidation is not built yet (RETAIL-ERP.md WO-23.3, analogous to WO-20.6) — this fact is held, not lost.',
        );
      },
    });
  }

  @OnDomainEvent(DomainEvent.GoodsReceived)
  async onGoodsReceived(payload: GoodsReceivedPayload): Promise<void> {
    await this.log.append(
      'GoodsReceipt',
      payload.goodsReceiptId,
      'UPSERT',
      payload,
      SCHEMA_VERSION,
      new Date(payload.receivedAtIso),
    );
  }
}

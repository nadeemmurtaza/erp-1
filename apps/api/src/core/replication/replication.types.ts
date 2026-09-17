import type { ReplicationClass, ReplicationDirection, ReplicationOp } from '../prisma/client';

/**
 * What a module states about one entity when it registers with
 * `ReplicationRegistry` — its own answer to "is this a fact or a policy,
 * and which way does it flow" (R2), plus how to fold an incoming record of
 * it into this node's own tables.
 */
export interface ReplicationEntityDescriptor {
  dataClass: ReplicationClass;
  direction: ReplicationDirection;
  /**
   * Applies one incoming record — an UPSERT or a DELETE — to this node's
   * own tables. Called only by `ReplicationApplyService` (WO-20.2's
   * receiving side calls that, never this directly). Throwing quarantines
   * the record rather than failing whatever triggered the apply batch.
   */
  apply(input: ReplicationApplyInput): Promise<void>;
}

export interface ReplicationApplyInput {
  entityId: string;
  op: ReplicationOp;
  payload: unknown;
  schemaVersion: number;
  originNodeId: string;
  occurredAt: Date;
}

/** The shape `ReplicationApplyService` and `ReplicationQuarantineService` share. */
export interface ReplicationRecordLike {
  originNodeId: string;
  sequence: bigint;
  entity: string;
  entityId: string;
  op: ReplicationOp;
  payload: unknown;
  schemaVersion: number;
}

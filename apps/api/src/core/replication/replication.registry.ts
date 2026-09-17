import { Injectable } from '@nestjs/common';
import type { ReplicationEntityDescriptor } from './replication.types';

/**
 * Where a module states what it replicates — the same keyed-registration
 * shape as `CartLineValidatorRegistry` (core/extension-points/), so
 * `ReplicationLogService.append()` and `ReplicationApplyService.apply()`
 * both work from one source of truth instead of each call site repeating
 * "is 'Order' a FACT?" and risking disagreement. A module registers once,
 * from its own `onModuleInit()`, the same convention `StockIntakeRegistry`
 * already uses.
 *
 * An unregistered entity is refused rather than silently accepted:
 * replicating something nobody has classified as FACT or POLICY is exactly
 * the mistake R2's whole convergence guarantee depends on not making.
 */
@Injectable()
export class ReplicationRegistry {
  private readonly entities = new Map<string, ReplicationEntityDescriptor>();

  register(entity: string, descriptor: ReplicationEntityDescriptor): void {
    if (this.entities.has(entity)) {
      throw new Error(`"${entity}" is already registered with ReplicationRegistry.`);
    }
    this.entities.set(entity, descriptor);
  }

  describe(entity: string): ReplicationEntityDescriptor | undefined {
    return this.entities.get(entity);
  }
}

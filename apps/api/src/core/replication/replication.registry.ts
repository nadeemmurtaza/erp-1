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
    // R2 pairs these strictly — a FACT that flows DOWN, or a POLICY that
    // flows UP, is not a variant, it is the mistake the whole
    // conflict-resolution model depends on nobody making.
    const valid =
      (descriptor.dataClass === 'FACT' && descriptor.direction === 'UP') ||
      (descriptor.dataClass === 'POLICY' && descriptor.direction === 'DOWN');
    if (!valid) {
      throw new Error(
        `"${entity}": ${descriptor.dataClass} must flow ${descriptor.dataClass === 'FACT' ? 'UP' : 'DOWN'} (R2), not ${descriptor.direction}.`,
      );
    }
    this.entities.set(entity, descriptor);
  }

  describe(entity: string): ReplicationEntityDescriptor | undefined {
    return this.entities.get(entity);
  }
}

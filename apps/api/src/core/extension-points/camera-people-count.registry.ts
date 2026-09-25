import { Injectable } from '@nestjs/common';

export interface CameraPeopleCountProvider {
  /** Total people the camera counted entering this location on this date, or
   * null if the vendor's own feed has no reading for that day. */
  countForDate(locationId: string, date: Date): Promise<number | null>;
}

/**
 * 156-single-employee-branch-loss-prevention.md §4. Lets
 * `SuspiciousTrafficService` ask for a camera's own people-count without
 * `inventory` depending on a camera-vendor module that does not exist in
 * this codebase yet (doc 30's `FaceMatchProvider` covers face-match for
 * attendance today, not people-counting). No handler is registered by
 * default — `countForDate()` then resolves to `null`, and the report
 * degrades to an explicit "not available" state rather than a fabricated
 * ratio, exactly as the document itself requires. A future camera-vendor
 * module registers itself here from its own `onModuleInit()`, the same
 * register()-from-init idiom `StockIntakeRegistry` already uses.
 */
@Injectable()
export class CameraPeopleCountRegistry {
  private provider: CameraPeopleCountProvider | null = null;

  register(provider: CameraPeopleCountProvider): void {
    this.provider = provider;
  }

  async countForDate(locationId: string, date: Date): Promise<number | null> {
    if (!this.provider) return null;
    return this.provider.countForDate(locationId, date);
  }
}

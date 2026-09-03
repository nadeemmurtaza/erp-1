import { Injectable } from '@nestjs/common';

/**
 * Lets a pack attach its own data onto a core entity's API response without
 * core ever importing the pack, or even knowing the pack's types exist.
 *
 * Core defines an enrichment point by name at the place it composes a
 * response (e.g. "orderItem.stitchingJob"), and calls `enrich()` with the
 * ids of the entities it just fetched. A pack registers an implementation
 * from its own module's `onModuleInit()` — legal, because a pack depending
 * on core is the allowed direction. A pack switched off in `MODULES` never
 * registers, so `enrich()` comes back an empty map and the response simply
 * omits that field, rather than the request failing.
 *
 * This is the read-time counterpart to domain events: events are for
 * one-directional side effects, this is for composing a response that needs
 * an answer back before it can be sent.
 */
export interface EntityEnricher<TResult = unknown> {
  enrich(entityIds: string[]): Promise<Map<string, TResult>>;
}

@Injectable()
export class EntityEnrichmentRegistry {
  private readonly enrichers = new Map<string, EntityEnricher>();

  /** Called once, from the registering pack's `onModuleInit()`. */
  register(point: string, enricher: EntityEnricher): void {
    if (this.enrichers.has(point)) {
      throw new Error(
        `An enricher is already registered for "${point}" — an enrichment point takes exactly one implementation.`,
      );
    }
    this.enrichers.set(point, enricher);
  }

  /** Returns an empty map when nothing is registered for `point`, or `entityIds` is empty. */
  async enrich<TResult = unknown>(point: string, entityIds: string[]): Promise<Map<string, TResult>> {
    if (entityIds.length === 0) return new Map();
    const enricher = this.enrichers.get(point) as EntityEnricher<TResult> | undefined;
    if (!enricher) return new Map();
    return enricher.enrich(entityIds);
  }
}

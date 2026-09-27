import { Injectable } from '@nestjs/common';

export interface DeprecationEntry {
  /** RFC 8594 `Deprecation` header value — an HTTP-date this version began being deprecated. */
  since: Date;
  /** RFC 8594 `Sunset` header value — the date this version stops serving requests. */
  sunsetAt: Date;
}

/**
 * resilience-scalability/37-scalability-future-upgrades.md (WO-37.1) — the
 * version/deprecation policy doc 37 §1 states in prose, made checkable:
 *
 *   - A route only gets a new version for a BREAKING change (a field
 *     removed, a type changed, a required field added). An additive change
 *     (a new optional field, a new endpoint) never bumps the version —
 *     enforced by review, not by this service (doc 37's own acceptance:
 *     "a lint/reviewer checklist, not automatable, named explicitly as
 *     such").
 *   - A deprecated version stays live for a stated minimum window with a
 *     `Deprecation`/`Sunset` header on every response, so an integrator
 *     gets a machine-readable warning before the version disappears.
 *   - Past its `sunsetAt`, the version stops serving — a REQUEST-shaped
 *     refusal (404), never a silent behavior change.
 *
 * Empty today, deliberately: `main.ts` wires URI versioning
 * (`VersioningType.URI`, defaultVersion '1') but nothing has ever shipped a
 * v2, so nothing is deprecated. This registry exists so the day a v1 route
 * IS superseded, deprecating it is a one-line `registerDeprecation()` call
 * plus a real `Sunset` header on the very next response — never a rewrite
 * of this mechanism under deadline. `DeprecationHeaderInterceptor` is the
 * consumer; both are unit-tested directly (register a fake deprecated
 * version, assert the interceptor's behavior) since there is no live route
 * to exercise this against yet — the same "ships inert, ready the day it's
 * needed" posture doc 38's own `CircuitBreaker` takes.
 */
@Injectable()
export class ApiVersionPolicyService {
  private readonly deprecations = new Map<string, DeprecationEntry>();

  registerDeprecation(version: string, entry: DeprecationEntry): void {
    this.deprecations.set(version, entry);
  }

  clearDeprecation(version: string): void {
    this.deprecations.delete(version);
  }

  getDeprecation(version: string): DeprecationEntry | undefined {
    return this.deprecations.get(version);
  }

  isSunset(version: string, now: Date = new Date()): boolean {
    const entry = this.deprecations.get(version);
    return entry !== undefined && now >= entry.sunsetAt;
  }
}

export type { EcosystemEventBusClient } from './ecosystem-event-bus.client';
export type { EcosystemModuleGatewayClient } from './ecosystem-module-gateway.client';

/**
 * Dependency injection tokens and wire contracts for the NEWAX Ecosystem
 * Module Gateway & Event Bus client.
 *
 * Conforms to:
 * - ECOSYSTEM.md ("The one rule: No repo calls another repo directly")
 * - 255-ecosystem-alignment-roadmap.md (WO-255.1)
 * - Enterprise Multi-Tenant SaaS Architecture (unlimited tenants, orgs, and users)
 * - core-newax Module Gateway & Event Bus specification
 */

export const ECOSYSTEM_MODULE_GATEWAY_CLIENT = 'ECOSYSTEM_MODULE_GATEWAY_CLIENT';
export const ECOSYSTEM_EVENT_BUS_CLIENT = 'ECOSYSTEM_EVENT_BUS_CLIENT';

/**
 * Standard cross-repo event envelope across all seven NEWAX repositories,
 * carrying explicit tenant and organization scoping for global enterprise multi-tenancy.
 */
export interface EcosystemEventEnvelope<T = unknown> {
  /** UUID v4 uniquely identifying this event occurrence. */
  eventId: string;
  /** Dot-delimited event name, e.g. "order.placed", "goods.received". */
  name: string;
  /** ISO-8601 UTC timestamp when the event occurred. */
  occurredAt: string;
  /** Source repository producing this event. */
  source: 'erp-1' | 'communicator' | 'nID' | 'core-newax' | 'newcom' | 'AegisDesk' | string;
  /** Enterprise multi-tenant identifier for strict tenant isolation. */
  tenantId?: string;
  /** Sub-organization or branch identifier within the enterprise tenant. */
  organizationId?: string;
  /** Cross-service correlation ID for distributed trace linking. */
  correlationId?: string;
  /** Schema contract version, default 1. */
  schemaVersion: number;
  /** Event payload object. */
  payload: T;
}

/**
 * Synchronous cross-module RPC request sent through core-newax Module Gateway
 * with multi-tenant isolation context.
 */
export interface GatewayRequest<T = unknown> {
  /** Target service/module registered in core-newax, e.g. 'Communicator', 'nID', 'newcom'. */
  targetModule: string;
  /** Action/method name to invoke on the target module. */
  action: string;
  /** Enterprise tenant ID for tenant-isolated execution. */
  tenantId?: string;
  /** Organization or branch ID. */
  organizationId?: string;
  /** Serialized payload data. */
  payload: T;
  /** Request timeout in milliseconds (defaults to 5000 ms). */
  timeoutMs?: number;
}

/**
 * Response received from core-newax Module Gateway.
 */
export interface GatewayResponse<R = unknown> {
  success: boolean;
  data?: R;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Payload received when Communicator's LiveProof engine captures
 * authenticated live camera proof for a customer refund/return claim.
 */
export interface RefundProofCapturedPayload {
  sessionId: string;
  orderId?: string | null;
  claimType: string;
  mediaType: 'live_photo' | 'live_video';
  mediaUrl: string;
  sha256Hash: string;
  fileSizeBytes: number;
  durationSeconds?: number | null;
  verificationScore: number;
  watermarkVerified: boolean;
  capturedAt: string;
}

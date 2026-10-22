export type { EcosystemEventBusClient } from './ecosystem-event-bus.client';
export type { EcosystemModuleGatewayClient } from './ecosystem-module-gateway.client';
/**
 * Dependency injection tokens and wire contracts for the NEWAX Ecosystem
 * Module Gateway & Event Bus client.
 *
 * Conforms to:
 * - ECOSYSTEM.md ("The one rule: No repo calls another repo directly")
 * - 255-ecosystem-alignment-roadmap.md (WO-255.1)
 * - core-newax Module Gateway & Event Bus specification
 */

export const ECOSYSTEM_MODULE_GATEWAY_CLIENT = 'ECOSYSTEM_MODULE_GATEWAY_CLIENT';
export const ECOSYSTEM_EVENT_BUS_CLIENT = 'ECOSYSTEM_EVENT_BUS_CLIENT';

/**
 * Standard cross-repo event envelope across all seven NEWAX repositories.
 */
export interface EcosystemEventEnvelope<T = unknown> {
  /** UUID v4 uniquely identifying this event occurrence. */
  eventId: string;
  /** Dot-delimited event name, e.g. "order.placed", "goods.received". */
  name: string;
  /** ISO-8601 UTC timestamp when the event occurred. */
  occurredAt: string;
  /** Source repository producing this event. */
  source: 'erp-1';
  /** Cross-service correlation ID for distributed trace linking. */
  correlationId?: string;
  /** Schema contract version, default 1. */
  schemaVersion: number;
  /** Event payload object. */
  payload: T;
}

/**
 * Synchronous cross-module RPC request sent through core-newax Module Gateway.
 */
export interface GatewayRequest<T = unknown> {
  /** Target service/module registered in core-newax, e.g. 'Communicator', 'nID', 'newcom'. */
  targetModule: string;
  /** Action/method name to invoke on the target module. */
  action: string;
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

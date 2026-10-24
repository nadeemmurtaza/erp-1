import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import type { EcosystemEventEnvelope } from './ecosystem.constants';

export interface EcosystemEventBusClient {
  /**
   * Publishes a domain event to the core-newax Event Bus.
   * All external event consumers (Communicator, newcom, etc.) receive it asynchronously.
   * Carries tenant and organization scoping for enterprise multi-tenancy.
   *
   * @returns true if accepted by the event bus or bypassed when ecosystem is disabled;
   *          false on delivery failure (caller should retry).
   */
  publish<T = unknown>(
    name: string,
    payload: T,
    options?: {
      correlationId?: string;
      tenantId?: string;
      organizationId?: string;
    },
  ): Promise<boolean>;
}

@Injectable()
export class HttpEcosystemEventBusClient implements EcosystemEventBusClient {
  private readonly logger = new Logger(HttpEcosystemEventBusClient.name);

  constructor(private readonly config: AppConfigService) {}

  async publish<T = unknown>(
    name: string,
    payload: T,
    options?: {
      correlationId?: string;
      tenantId?: string;
      organizationId?: string;
    },
  ): Promise<boolean> {
    if (!this.config.isEcosystemEnabled) {
      this.logger.debug(
        `Ecosystem disabled: cross-repo event "${name}" not published to central bus.`,
      );
      return true;
    }

    const eventBusUrl = this.config.ecosystemEventBusUrl;
    if (!eventBusUrl) {
      this.logger.warn(
        `ECOSYSTEM_ENABLED=true but ECOSYSTEM_EVENT_BUS_URL is not set. Event "${name}" dropped.`,
      );
      return false;
    }

    const envelope: EcosystemEventEnvelope<T> = {
      eventId: randomUUID(),
      name,
      occurredAt: new Date().toISOString(),
      source: 'erp-1',
      tenantId: options?.tenantId,
      organizationId: options?.organizationId,
      correlationId: options?.correlationId,
      schemaVersion: 1,
      payload,
    };

    const endpoint = `${eventBusUrl.replace(/\/+$/, '')}/publish`;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Newax-Source': 'erp-1',
      };

      if (options?.tenantId) {
        headers['X-Tenant-Id'] = options.tenantId;
      }
      if (options?.organizationId) {
        headers['X-Organization-Id'] = options.organizationId;
      }

      if (this.config.ecosystemGatewayKey) {
        headers['Authorization'] = `Bearer ${this.config.ecosystemGatewayKey}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(envelope),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.error(
          `Event bus HTTP ${response.status} publishing "${name}": ${text}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to publish event "${name}" to central bus: ${msg}`);
      return false;
    }
  }
}

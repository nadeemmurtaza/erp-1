import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import type {
  GatewayRequest,
  GatewayResponse,
} from './ecosystem.constants';

export interface EcosystemModuleGatewayClient {
  /**
   * Invokes an action on an external NEWAX module via core-newax Module Gateway.
   * Never calls another repository directly (ECOSYSTEM.md Law 1).
   * Enforces multi-tenant isolation via tenant context headers.
   */
  call<T = unknown, R = unknown>(request: GatewayRequest<T>): Promise<GatewayResponse<R>>;
}

@Injectable()
export class HttpEcosystemModuleGatewayClient implements EcosystemModuleGatewayClient {
  private readonly logger = new Logger(HttpEcosystemModuleGatewayClient.name);

  constructor(private readonly config: AppConfigService) {}

  async call<T = unknown, R = unknown>(
    request: GatewayRequest<T>,
  ): Promise<GatewayResponse<R>> {
    if (!this.config.isEcosystemEnabled) {
      this.logger.debug(
        `Ecosystem disabled: gateway call to ${request.targetModule}.${request.action} bypassed.`,
      );
      return {
        success: false,
        error: {
          code: 'ECOSYSTEM_DISABLED',
          message: 'NEWAX Ecosystem integration is disabled (ECOSYSTEM_ENABLED=false).',
        },
      };
    }

    const gatewayUrl = this.config.ecosystemGatewayUrl;
    if (!gatewayUrl) {
      return {
        success: false,
        error: {
          code: 'GATEWAY_URL_MISSING',
          message: 'ECOSYSTEM_GATEWAY_URL is not configured.',
        },
      };
    }

    const endpoint = `${gatewayUrl.replace(/\/+$/, '')}/invoke`;
    const timeoutMs = request.timeoutMs ?? 5000;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Newax-Source': 'erp-1',
      };

      if (request.tenantId) {
        headers['X-Tenant-Id'] = request.tenantId;
      }
      if (request.organizationId) {
        headers['X-Organization-Id'] = request.organizationId;
      }

      if (this.config.ecosystemGatewayKey) {
        headers['Authorization'] = `Bearer ${this.config.ecosystemGatewayKey}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          targetModule: request.targetModule,
          action: request.action,
          tenantId: request.tenantId,
          organizationId: request.organizationId,
          payload: request.payload,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.warn(
          `Gateway error HTTP ${response.status} invoking ${request.targetModule}.${request.action}: ${text}`,
        );
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: `Gateway responded with HTTP ${response.status}`,
            details: text,
          },
        };
      }

      const body = (await response.json()) as GatewayResponse<R>;
      return body;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to invoke ${request.targetModule}.${request.action} via gateway: ${msg}`,
      );
      return {
        success: false,
        error: {
          code: 'GATEWAY_REQUEST_FAILED',
          message: msg,
        },
      };
    }
  }
}

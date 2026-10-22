import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { AppConfigService } from '../config/app-config.service';
import type { EcosystemEventEnvelope } from './ecosystem.constants';
import { EcosystemInboundService, type InboundEventProcessResult } from './ecosystem-inbound.service';

/**
 * Ecosystem Inbound Webhook Controller (ECOSYSTEM.md, WO-255.4).
 *
 * Receives cross-repo domain events from core-newax Event Bus / Communicator / nID.
 * Enforces enterprise multi-tenant scoping and gateway token verification when enabled.
 */
@ApiTags('ecosystem')
@Controller('ecosystem')
export class EcosystemController {
  private readonly logger = new Logger(EcosystemController.name);

  constructor(
    private readonly inboundService: EcosystemInboundService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receives cross-repo events from core-newax Event Bus / Communicator' })
  async handleInboundEvent(
    @Body() envelope: EcosystemEventEnvelope,
    @Headers('x-newax-source') sourceHeader?: string,
    @Headers('x-tenant-id') tenantIdHeader?: string,
    @Headers('x-organization-id') orgIdHeader?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<InboundEventProcessResult> {
    // If gateway key is configured, enforce bearer verification
    const expectedKey = this.config.ecosystemGatewayKey;
    if (expectedKey) {
      const token = authHeader?.replace(/^Bearer\s+/i, '');
      if (token !== expectedKey) {
        this.logger.warn('Rejected inbound ecosystem event: invalid gateway token.');
        throw new UnauthorizedException('Invalid ecosystem gateway authentication token.');
      }
    }

    // Merge header tenant context if not set in payload envelope
    const enrichedEnvelope: EcosystemEventEnvelope = {
      ...envelope,
      source: (sourceHeader || envelope.source || 'core-newax') as any,
      tenantId: tenantIdHeader || envelope.tenantId,
      organizationId: orgIdHeader || envelope.organizationId,
    };

    return this.inboundService.processEvent(enrichedEnvelope);
  }
}

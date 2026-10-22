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
import { CryptoMeshService } from '../crypto/crypto-mesh.service';
import type { EcosystemEventEnvelope } from './ecosystem.constants';
import { EcosystemInboundService, type InboundEventProcessResult } from './ecosystem-inbound.service';

/**
 * Ecosystem Inbound Webhook Controller (ECOSYSTEM.md, WO-255.4).
 *
 * Receives cross-repo domain events from core-newax Event Bus / Communicator / nID.
 * Enforces enterprise multi-tenant scoping and zero-trust cryptographic transit decryption.
 */
@ApiTags('ecosystem')
@Controller('ecosystem')
export class EcosystemController {
  private readonly logger = new Logger(EcosystemController.name);

  constructor(
    private readonly inboundService: EcosystemInboundService,
    private readonly config: AppConfigService,
    private readonly cryptoMesh: CryptoMeshService,
  ) {}

  @Public()
  @Post('events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receives cross-repo events from core-newax Event Bus / Communicator' })
  async handleInboundEvent(
    @Body() incomingData: EcosystemEventEnvelope | Record<string, unknown>,
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

    // Transparently decrypt EncryptedTransitEnvelope if payload is protected via NeuraCore Crypto-Mesh
    let envelope: EcosystemEventEnvelope;
    if (this.cryptoMesh.isEnvelope(incomingData)) {
      this.logger.log(`Decrypting banking-grade transit envelope from ${incomingData.senderId}`);
      envelope = this.cryptoMesh.decryptFromRelay<EcosystemEventEnvelope>(incomingData);
    } else {
      envelope = incomingData as EcosystemEventEnvelope;
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

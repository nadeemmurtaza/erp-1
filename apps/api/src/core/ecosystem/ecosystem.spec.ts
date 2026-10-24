import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from '../config/app-config.service';
import { DomainEvent } from '../events/domain-events';
import {
  ECOSYSTEM_EVENT_BUS_CLIENT,
} from './ecosystem.constants';
import { EcosystemController } from './ecosystem.controller';
import { EcosystemEventBridgeService } from './ecosystem-event-bridge.service';
import { HttpEcosystemEventBusClient } from './ecosystem-event-bus.client';
import { EcosystemInboundService } from './ecosystem-inbound.service';
import { HttpEcosystemModuleGatewayClient } from './ecosystem-module-gateway.client';

describe('NEWAX Ecosystem Clients (Enterprise Multi-Tenant)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('HttpEcosystemModuleGatewayClient', () => {
    it('returns ECOSYSTEM_DISABLED when ecosystem is disabled', async () => {
      const mockConfig = {
        isEcosystemEnabled: false,
        ecosystemGatewayUrl: undefined,
        ecosystemGatewayKey: undefined,
      } as unknown as AppConfigService;

      const client = new HttpEcosystemModuleGatewayClient(mockConfig);
      const res = await client.call({
        targetModule: 'Communicator',
        action: 'lookupContact',
        payload: { email: 'user@example.com' },
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('ECOSYSTEM_DISABLED');
    });

    it('returns GATEWAY_URL_MISSING when URL is not configured', async () => {
      const mockConfig = {
        isEcosystemEnabled: true,
        ecosystemGatewayUrl: undefined,
        ecosystemGatewayKey: undefined,
      } as unknown as AppConfigService;

      const client = new HttpEcosystemModuleGatewayClient(mockConfig);
      const res = await client.call({
        targetModule: 'Communicator',
        action: 'lookupContact',
        payload: { email: 'user@example.com' },
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('GATEWAY_URL_MISSING');
    });

    it('successfully calls gateway with multi-tenant headers and payload', async () => {
      const mockConfig = {
        isEcosystemEnabled: true,
        ecosystemGatewayUrl: 'https://gateway.example.com',
        ecosystemGatewayKey: 'secret-key-123',
      } as unknown as AppConfigService;

      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any;

      globalThis.fetch = jest.fn().mockImplementation(async (url, init) => {
        capturedUrl = url.toString();
        capturedHeaders = init?.headers as Record<string, string>;
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { contactId: 'cnt-456' } }),
        };
      });

      const client = new HttpEcosystemModuleGatewayClient(mockConfig);
      const res = await client.call({
        targetModule: 'Communicator',
        action: 'lookupContact',
        tenantId: 'tenant-enterprise-01',
        organizationId: 'org-apac',
        payload: { email: 'user@example.com' },
      });

      expect(capturedUrl).toBe('https://gateway.example.com/invoke');
      expect(capturedHeaders['X-Newax-Source']).toBe('erp-1');
      expect(capturedHeaders['X-Tenant-Id']).toBe('tenant-enterprise-01');
      expect(capturedHeaders['X-Organization-Id']).toBe('org-apac');
      expect(capturedHeaders['Authorization']).toBe('Bearer secret-key-123');
      expect(capturedBody).toEqual({
        targetModule: 'Communicator',
        action: 'lookupContact',
        tenantId: 'tenant-enterprise-01',
        organizationId: 'org-apac',
        payload: { email: 'user@example.com' },
      });
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ contactId: 'cnt-456' });
    });

    it('handles HTTP error status codes gracefully', async () => {
      const mockConfig = {
        isEcosystemEnabled: true,
        ecosystemGatewayUrl: 'https://gateway.example.com',
        ecosystemGatewayKey: 'secret-key-123',
      } as unknown as AppConfigService;

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Gateway Service Unavailable',
      });

      const client = new HttpEcosystemModuleGatewayClient(mockConfig);
      const res = await client.call({
        targetModule: 'nID',
        action: 'verifySession',
        payload: {},
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('HTTP_503');
      expect(res.error?.message).toContain('503');
    });

    it('handles network / fetch exceptions without throwing', async () => {
      const mockConfig = {
        isEcosystemEnabled: true,
        ecosystemGatewayUrl: 'https://gateway.example.com',
        ecosystemGatewayKey: 'secret-key-123',
      } as unknown as AppConfigService;

      globalThis.fetch = jest.fn().mockRejectedValue(new Error('Connection reset'));

      const client = new HttpEcosystemModuleGatewayClient(mockConfig);
      const res = await client.call({
        targetModule: 'nID',
        action: 'verifySession',
        payload: {},
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('GATEWAY_REQUEST_FAILED');
      expect(res.error?.message).toBe('Connection reset');
    });
  });

  describe('HttpEcosystemEventBusClient', () => {
    it('bypasses publishing and returns true when ecosystem is disabled', async () => {
      const mockConfig = {
        isEcosystemEnabled: false,
        ecosystemEventBusUrl: undefined,
        ecosystemGatewayKey: undefined,
      } as unknown as AppConfigService;

      const client = new HttpEcosystemEventBusClient(mockConfig);
      const res = await client.publish(DomainEvent.OrderPlaced, { orderId: 'ord-123' });

      expect(res).toBe(true);
    });

    it('publishes wrapped event envelope with multi-tenant context to event bus', async () => {
      const mockConfig = {
        isEcosystemEnabled: true,
        ecosystemEventBusUrl: 'https://events.example.com',
        ecosystemGatewayKey: 'secret-key-123',
      } as unknown as AppConfigService;

      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any;

      globalThis.fetch = jest.fn().mockImplementation(async (url, init) => {
        capturedUrl = url.toString();
        capturedHeaders = init?.headers as Record<string, string>;
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({ accepted: true }),
        };
      });

      const client = new HttpEcosystemEventBusClient(mockConfig);
      const res = await client.publish(
        DomainEvent.OrderPlaced,
        { orderId: 'ord-123', totalMinor: 500000 },
        {
          correlationId: 'corr-789',
          tenantId: 'tenant-enterprise-01',
          organizationId: 'org-emea',
        },
      );

      expect(res).toBe(true);
      expect(capturedUrl).toBe('https://events.example.com/publish');
      expect(capturedHeaders['X-Tenant-Id']).toBe('tenant-enterprise-01');
      expect(capturedHeaders['X-Organization-Id']).toBe('org-emea');
      expect(capturedBody.name).toBe(DomainEvent.OrderPlaced);
      expect(capturedBody.source).toBe('erp-1');
      expect(capturedBody.tenantId).toBe('tenant-enterprise-01');
      expect(capturedBody.organizationId).toBe('org-emea');
      expect(capturedBody.schemaVersion).toBe(1);
      expect(capturedBody.correlationId).toBe('corr-789');
      expect(capturedBody.payload).toEqual({ orderId: 'ord-123', totalMinor: 500000 });
      expect(capturedBody.eventId).toBeDefined();
      expect(capturedBody.occurredAt).toBeDefined();
    });

    it('returns false when event bus responds with error status', async () => {
      const mockConfig = {
        isEcosystemEnabled: true,
        ecosystemEventBusUrl: 'https://events.example.com',
      } as unknown as AppConfigService;

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Error',
      });

      const client = new HttpEcosystemEventBusClient(mockConfig);
      const res = await client.publish('order.placed', {});

      expect(res).toBe(false);
    });
  });

  describe('EcosystemEventBridgeService', () => {
    it('forwards domain events to event bus client', async () => {
      const mockEventBusClient = {
        publish: jest.fn().mockResolvedValue(true),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EcosystemEventBridgeService,
          {
            provide: ECOSYSTEM_EVENT_BUS_CLIENT,
            useValue: mockEventBusClient,
          },
        ],
      }).compile();

      const bridge = module.get<EcosystemEventBridgeService>(EcosystemEventBridgeService);

      await bridge.handleOrderPlaced({ orderId: 'ord-999' });
      expect(mockEventBusClient.publish).toHaveBeenCalledWith(
        DomainEvent.OrderPlaced,
        { orderId: 'ord-999' },
      );

      await bridge.handlePaymentSucceeded({ paymentId: 'pay-111' });
      expect(mockEventBusClient.publish).toHaveBeenCalledWith(
        DomainEvent.PaymentSucceeded,
        { paymentId: 'pay-111' },
      );
    });
  });

  describe('EcosystemInboundService (WO-255.4 LiveProof Ingestion)', () => {
    let inboundService: EcosystemInboundService;
    let mockAudit: any;
    let mockPrisma: any;

    beforeEach(() => {
      mockAudit = { record: jest.fn().mockResolvedValue(undefined) };
      mockPrisma = {};
      inboundService = new EcosystemInboundService(mockPrisma, mockAudit);
    });

    it('processes and links authentic live proof to order with audit trail', async () => {
      const result = await inboundService.processEvent({
        eventId: 'evt-lp-100',
        name: 'refund.proof_captured',
        occurredAt: new Date().toISOString(),
        source: 'communicator',
        tenantId: 'tenant-enterprise-01',
        organizationId: 'org-lahore',
        schemaVersion: 1,
        payload: {
          sessionId: 'ses-456',
          orderId: 'ORD-7788',
          claimType: 'refund',
          mediaType: 'live_video',
          mediaUrl: 'https://communicator.example.com/media/ses-456.webm',
          sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          fileSizeBytes: 4500000,
          durationSeconds: 15.0,
          verificationScore: 1.0,
          watermarkVerified: true,
          capturedAt: new Date().toISOString(),
        },
      });

      expect(result.accepted).toBe(true);
      expect(result.actionTaken).toBe('proof_verified_and_linked');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'order.return_proof_captured',
          entity: 'Order',
          entityId: 'ORD-7788',
          data: expect.objectContaining({
            isAuthentic: true,
            sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          }),
        }),
      );
    });

    it('flags unverified or tampered proof for manual staff review', async () => {
      const result = await inboundService.processEvent({
        eventId: 'evt-lp-101',
        name: 'refund.proof_captured',
        occurredAt: new Date().toISOString(),
        source: 'communicator',
        tenantId: 'tenant-enterprise-01',
        schemaVersion: 1,
        payload: {
          sessionId: 'ses-suspicious',
          orderId: 'ORD-9999',
          claimType: 'refund',
          mediaType: 'live_photo',
          mediaUrl: 'https://communicator.example.com/media/ses-suspicious.jpg',
          sha256Hash: 'abcdef123456',
          fileSizeBytes: 200000,
          verificationScore: 0.5,
          watermarkVerified: false,
          capturedAt: new Date().toISOString(),
        },
      });

      expect(result.accepted).toBe(true);
      expect(result.actionTaken).toBe('proof_flagged_for_manual_review');
    });
  });

  describe('EcosystemController', () => {
    it('enforces gateway key verification when configured', async () => {
      const mockInbound = { processEvent: jest.fn() };
      const mockConfig = { ecosystemGatewayKey: 'valid-secret-key' } as any;

      const mockCryptoMesh = { isEnvelope: jest.fn().mockReturnValue(false), decryptFromRelay: jest.fn() };
      const controller = new EcosystemController(mockInbound as any, mockConfig, mockCryptoMesh as any);

      // Fails with invalid key
      await expect(
        controller.handleInboundEvent(
          { eventId: 'evt-1', name: 'test', occurredAt: '', source: 'communicator', schemaVersion: 1, payload: {} },
          undefined,
          undefined,
          undefined,
          'Bearer wrong-key',
        ),
      ).rejects.toThrow(UnauthorizedException);

      // Succeeds with valid key
      mockInbound.processEvent.mockResolvedValueOnce({ accepted: true, eventName: 'test', actionTaken: 'ok' });
      const res = await controller.handleInboundEvent(
        { eventId: 'evt-1', name: 'test', occurredAt: '', source: 'communicator', schemaVersion: 1, payload: {} },
        'communicator',
        'tenant-01',
        undefined,
        'Bearer valid-secret-key',
      );
      expect(res.accepted).toBe(true);
      expect(mockInbound.processEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'communicator',
          tenantId: 'tenant-01',
        }),
      );
    });

    it('decrypts encrypted transit envelopes before processing', async () => {
      const mockInbound = { processEvent: jest.fn().mockResolvedValue({ accepted: true, eventName: 'refund.proof_captured', actionTaken: 'decrypted_and_processed' }) };
      const mockConfig = { ecosystemGatewayKey: undefined } as any;
      const decryptedPayload = {
        eventId: 'evt-secure-100',
        name: 'refund.proof_captured',
        occurredAt: '2026-10-22T12:00:00Z',
        source: 'communicator',
        schemaVersion: 1,
        payload: { returnRequestId: 'ret-77', liveProofSessionId: 'sess-88', confidenceScore: 0.99 },
      };
      const mockCryptoMesh = {
        isEnvelope: jest.fn().mockReturnValue(true),
        decryptFromRelay: jest.fn().mockReturnValue(decryptedPayload),
      };
      const controller = new EcosystemController(mockInbound as any, mockConfig, mockCryptoMesh as any);

      const encryptedEnvelope = {
        version: '1.0.0',
        tenantId: 'tenant-secure',
        senderId: 'communicator',
        recipientId: 'erp-1',
        iv: 'fake-iv',
        ciphertext: 'fake-ciphertext',
        authTag: 'fake-tag',
        keyId: 'kid-1',
        timestamp: '2026-10-22T12:00:00Z',
        signature: 'fake-sig',
      };

      const res = await controller.handleInboundEvent(encryptedEnvelope as any);
      expect(res.accepted).toBe(true);
      expect(mockCryptoMesh.decryptFromRelay).toHaveBeenCalledWith(encryptedEnvelope);
      expect(mockInbound.processEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt-secure-100',
          name: 'refund.proof_captured',
        }),
      );
    });
  });
});

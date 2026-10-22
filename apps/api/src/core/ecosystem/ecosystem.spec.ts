import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from '../config/app-config.service';
import { DomainEvent } from '../events/domain-events';
import {
  ECOSYSTEM_EVENT_BUS_CLIENT,
  ECOSYSTEM_MODULE_GATEWAY_CLIENT,
} from './ecosystem.constants';
import { EcosystemEventBridgeService } from './ecosystem-event-bridge.service';
import { HttpEcosystemEventBusClient } from './ecosystem-event-bus.client';
import { HttpEcosystemModuleGatewayClient } from './ecosystem-module-gateway.client';

describe('NEWAX Ecosystem Clients (WO-255.1)', () => {
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
        payload: { phone: '+923001234567' },
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
        payload: {},
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('GATEWAY_URL_MISSING');
    });

    it('successfully calls gateway when enabled and receives response', async () => {
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
          json: async () => ({
            success: true,
            data: { contactId: 'cnt-456' },
          }),
        };
      });

      const client = new HttpEcosystemModuleGatewayClient(mockConfig);
      const res = await client.call({
        targetModule: 'Communicator',
        action: 'lookupContact',
        payload: { email: 'user@example.com' },
      });

      expect(capturedUrl).toBe('https://gateway.example.com/invoke');
      expect(capturedHeaders['X-Newax-Source']).toBe('erp-1');
      expect(capturedHeaders['Authorization']).toBe('Bearer secret-key-123');
      expect(capturedBody).toEqual({
        targetModule: 'Communicator',
        action: 'lookupContact',
        payload: { email: 'user@example.com' },
      });
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ contactId: 'cnt-456' });
    });

    it('handles HTTP error status codes gracefully', async () => {
      const mockConfig = {
        isEcosystemEnabled: true,
        ecosystemGatewayUrl: 'https://gateway.example.com',
        ecosystemGatewayKey: undefined,
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
    });

    it('handles network / fetch exceptions without throwing', async () => {
      const mockConfig = {
        isEcosystemEnabled: true,
        ecosystemGatewayUrl: 'https://gateway.example.com',
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
      expect(res.error?.message).toContain('Connection reset');
    });
  });

  describe('HttpEcosystemEventBusClient', () => {
    it('bypasses publishing and returns true when ecosystem is disabled', async () => {
      const mockConfig = {
        isEcosystemEnabled: false,
        ecosystemEventBusUrl: undefined,
      } as unknown as AppConfigService;

      const client = new HttpEcosystemEventBusClient(mockConfig);
      const res = await client.publish(DomainEvent.OrderPlaced, { orderId: 'ord-123' });

      expect(res).toBe(true);
    });

    it('publishes wrapped event envelope to event bus when enabled', async () => {
      const mockConfig = {
        isEcosystemEnabled: true,
        ecosystemEventBusUrl: 'https://events.example.com',
        ecosystemGatewayKey: 'key-abc',
      } as unknown as AppConfigService;

      let capturedUrl = '';
      let capturedBody: any;

      globalThis.fetch = jest.fn().mockImplementation(async (url, init) => {
        capturedUrl = url.toString();
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
        };
      });

      const client = new HttpEcosystemEventBusClient(mockConfig);
      const res = await client.publish(
        DomainEvent.OrderPlaced,
        { orderId: 'ord-123', totalMinor: 500000 },
        'corr-789',
      );

      expect(res).toBe(true);
      expect(capturedUrl).toBe('https://events.example.com/publish');
      expect(capturedBody.name).toBe(DomainEvent.OrderPlaced);
      expect(capturedBody.source).toBe('erp-1');
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
});

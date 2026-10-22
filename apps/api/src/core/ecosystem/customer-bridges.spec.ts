import type { AppConfigService } from '../config/app-config.service';
import type { EcosystemEventBusClient } from './ecosystem-event-bus.client';
import type { EcosystemModuleGatewayClient } from './ecosystem-module-gateway.client';
import { SupportTicketBridge } from './support-ticket-bridge.service';
import { CustomerEngagementBridge } from './customer-engagement-bridge.service';
import { MarketingDispatchBridge } from './marketing-dispatch-bridge.service';

describe('Decoupled Domain Bridges (WO-255.5 / WO-255.6)', () => {
  let mockConfig: jest.Mocked<AppConfigService>;
  let mockEventBus: jest.Mocked<EcosystemEventBusClient>;
  let mockGateway: jest.Mocked<EcosystemModuleGatewayClient>;

  beforeEach(() => {
    mockConfig = {
      get: jest.fn(),
    } as unknown as jest.Mocked<AppConfigService>;

    mockEventBus = {
      publish: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<EcosystemEventBusClient>;

    mockGateway = {
      call: jest.fn().mockResolvedValue({ success: true, data: {} }),
    } as unknown as jest.Mocked<EcosystemModuleGatewayClient>;
  });

  describe('SupportTicketBridge (WO-255.5)', () => {
    it('does not delegate when ECOSYSTEM_ENABLED is false', async () => {
      mockConfig.get.mockReturnValue(false);
      const bridge = new SupportTicketBridge(mockConfig, mockEventBus, mockGateway);

      const result = await bridge.delegateTicket({
        ticketId: 'tkt_123',
        subject: 'Return issue',
        category: 'RETURNS',
      });

      expect(result.delegated).toBe(false);
      expect(mockEventBus.publish).not.toHaveBeenCalled();
      expect(mockGateway.call).not.toHaveBeenCalled();
    });

    it('delegates ticket to Communicator via event bus and gateway when ECOSYSTEM_ENABLED is true', async () => {
      mockConfig.get.mockReturnValue(true);
      const bridge = new SupportTicketBridge(mockConfig, mockEventBus, mockGateway);

      const result = await bridge.delegateTicket({
        ticketId: 'tkt_456',
        customerId: 'cust_789',
        subject: 'Defective zipper',
        category: 'QUALITY',
        priority: 'HIGH',
        tenantId: 'tenant_pk_01',
      });

      expect(result.delegated).toBe(true);
      expect(result.externalService).toBe('Communicator');
      expect(result.deepLinkUrl).toContain('/tkt_456');

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'support.ticket.created',
        expect.objectContaining({
          ticketId: 'tkt_456',
          customerId: 'cust_789',
          subject: 'Defective zipper',
          priority: 'HIGH',
          tenantId: 'tenant_pk_01',
        }),
      );

      expect(mockGateway.call).toHaveBeenCalledWith(
        expect.objectContaining({
          targetModule: 'Communicator',
          action: 'syncTicket',
          tenantId: 'tenant_pk_01',
        }),
      );
    });
  });

  describe('CustomerEngagementBridge (WO-255.5)', () => {
    it('returns empty when ECOSYSTEM_ENABLED is false', async () => {
      mockConfig.get.mockReturnValue(false);
      const bridge = new CustomerEngagementBridge(mockConfig, mockGateway);

      const result = await bridge.fetchCustomerTimeline('cust_111');

      expect(result.available).toBe(false);
      expect(result.conversations).toHaveLength(0);
      expect(mockGateway.call).not.toHaveBeenCalled();
    });

    it('queries Communicator timeline through gateway when ECOSYSTEM_ENABLED is true', async () => {
      mockConfig.get.mockReturnValue(true);
      mockGateway.call.mockResolvedValueOnce({
        success: true,
        data: {
          conversations: [
            {
              id: 'conv_1',
              channel: 'WHATSAPP',
              subject: 'Inquiry',
              lastMessageAt: '2026-10-22T10:00:00Z',
              status: 'CLOSED',
            },
          ],
        },
      });

      const bridge = new CustomerEngagementBridge(mockConfig, mockGateway);
      const result = await bridge.fetchCustomerTimeline('cust_222', { tenantId: 't_1' });

      expect(result.available).toBe(true);
      expect(result.externalService).toBe('Communicator');
      expect(result.embedUrl).toContain('/cust_222');
      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0]?.channel).toBe('WHATSAPP');

      expect(mockGateway.call).toHaveBeenCalledWith(
        expect.objectContaining({
          targetModule: 'Communicator',
          action: 'getContactTimeline',
          tenantId: 't_1',
          payload: { customerId: 'cust_222' },
        }),
      );
    });
  });

  describe('MarketingDispatchBridge (WO-255.6)', () => {
    it('does not delegate when ECOSYSTEM_ENABLED is false', async () => {
      mockConfig.get.mockReturnValue(false);
      const bridge = new MarketingDispatchBridge(mockConfig, mockEventBus, mockGateway);

      const result = await bridge.delegateCampaign({
        campaignId: 'cmp_100',
        name: 'Flash Sale',
        channel: 'EMAIL',
      });

      expect(result.delegated).toBe(false);
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('delegates EMAIL campaigns to newcom when ECOSYSTEM_ENABLED is true', async () => {
      mockConfig.get.mockReturnValue(true);
      const bridge = new MarketingDispatchBridge(mockConfig, mockEventBus, mockGateway);

      const result = await bridge.delegateCampaign({
        campaignId: 'cmp_200',
        name: 'Eid Discount Blast',
        channel: 'EMAIL',
        tenantId: 't_2',
      });

      expect(result.delegated).toBe(true);
      expect(result.externalEngine).toBe('newcom');

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'marketing.campaign.dispatched',
        expect.objectContaining({
          campaignId: 'cmp_200',
          channel: 'EMAIL',
          targetEngine: 'newcom',
          tenantId: 't_2',
        }),
      );

      expect(mockGateway.call).toHaveBeenCalledWith(
        expect.objectContaining({
          targetModule: 'newcom',
          action: 'queueCampaign',
        }),
      );
    });

    it('delegates SMS/WHATSAPP campaigns to Communicator when ECOSYSTEM_ENABLED is true', async () => {
      mockConfig.get.mockReturnValue(true);
      const bridge = new MarketingDispatchBridge(mockConfig, mockEventBus, mockGateway);

      const result = await bridge.delegateCampaign({
        campaignId: 'cmp_300',
        name: 'VIP WhatsApp Perks',
        channel: 'WHATSAPP',
      });

      expect(result.delegated).toBe(true);
      expect(result.externalEngine).toBe('Communicator');
      expect(mockGateway.call).toHaveBeenCalledWith(
        expect.objectContaining({
          targetModule: 'Communicator',
        }),
      );
    });
  });
});

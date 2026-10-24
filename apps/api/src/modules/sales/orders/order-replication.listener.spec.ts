import { OrderReplicationListener } from './order-replication.listener';
import { ReplicationRegistry } from '../../../core/replication/replication.registry';
import { ReplicationLogService } from '../../../core/replication/replication-log.service';

describe('OrderReplicationListener — WO-20.4', () => {
  let listener: OrderReplicationListener;
  let registry: any;
  let log: any;

  beforeEach(() => {
    registry = { register: jest.fn() };
    log = { append: jest.fn().mockResolvedValue(undefined) };
    listener = new OrderReplicationListener(registry as ReplicationRegistry, log as ReplicationLogService);
  });

  describe('onModuleInit', () => {
    it('registers Order as a FACT entity flowing UP', () => {
      listener.onModuleInit();

      expect(registry.register).toHaveBeenCalledWith(
        'Order',
        expect.objectContaining({ dataClass: 'FACT', direction: 'UP', apply: expect.any(Function) }),
      );
    });

    it('quarantines every incoming Order fact — chain-wide consolidation is not built yet (WO-20.6)', () => {
      listener.onModuleInit();
      const descriptor = registry.register.mock.calls[0][1];

      expect(() => descriptor.apply()).toThrow(/not built yet/);
    });
  });

  describe('onOrderPlaced', () => {
    it('logs the payload OrdersService already published, unchanged, dated at when the order was placed', async () => {
      const payload = {
        orderId: 'o1',
        orderNumber: 'YSN-2026-0001',
        userId: 'u1',
        customerName: 'Sana',
        customerPhone: null,
        customerEmail: null,
        grandTotal: 1500,
        placedAt: '2026-01-15T10:00:00.000Z',
        stitchingItemIds: [],
      };

      await listener.onOrderPlaced(payload);

      expect(log.append).toHaveBeenCalledWith('Order', 'o1', 'UPSERT', payload, 1, new Date('2026-01-15T10:00:00.000Z'));
    });
  });
});

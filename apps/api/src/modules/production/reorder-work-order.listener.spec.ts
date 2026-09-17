import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ReorderWorkOrderListener } from './reorder-work-order.listener';
import { WorkOrdersService } from './work-orders.service';

describe('ReorderWorkOrderListener', () => {
  let listener: ReorderWorkOrderListener;
  let workOrders: any;

  const basePayload = {
    productId: 'p1',
    variantId: 'v1',
    sku: 'SKU1',
    stock: 5,
    reorderPoint: 10,
    reorderQuantity: 20,
    producedInHouse: true,
    preferredSupplierId: null,
  };

  beforeEach(async () => {
    workOrders = {
      findOpenForVariant: jest.fn().mockResolvedValue(null),
      topUpQuantity: jest.fn(),
      create: jest.fn().mockResolvedValue({ number: 'WO-2026-0001' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReorderWorkOrderListener, { provide: WorkOrdersService, useValue: workOrders }],
    }).compile();

    listener = module.get(ReorderWorkOrderListener);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  it('ignores an externally sourced variant — purchasing owns those', async () => {
    await listener.onReorderPointReached({ ...basePayload, producedInHouse: false });
    expect(workOrders.create).not.toHaveBeenCalled();
    expect(workOrders.findOpenForVariant).not.toHaveBeenCalled();
  });

  it('opens a new WorkOrder when none is already open', async () => {
    await listener.onReorderPointReached(basePayload);
    expect(workOrders.create).toHaveBeenCalledWith({
      variantId: 'v1',
      quantityOrdered: 20,
      source: 'REORDER',
    });
  });

  it('tops up an existing open REORDER work order instead of duplicating it', async () => {
    workOrders.findOpenForVariant.mockResolvedValue({ id: 'wo1', number: 'WO-2026-0001' });
    await listener.onReorderPointReached(basePayload);
    expect(workOrders.topUpQuantity).toHaveBeenCalledWith('wo1', 20);
    expect(workOrders.create).not.toHaveBeenCalled();
  });

  it('logs and swallows a missing-BOM error rather than retrying forever', async () => {
    workOrders.create.mockRejectedValue(new BadRequestException('no BOM configured'));
    await expect(listener.onReorderPointReached(basePayload)).resolves.toBeUndefined();
  });

  it('rethrows an unexpected error so the outbox retries it', async () => {
    workOrders.create.mockRejectedValue(new Error('db down'));
    await expect(listener.onReorderPointReached(basePayload)).rejects.toThrow('db down');
  });
});

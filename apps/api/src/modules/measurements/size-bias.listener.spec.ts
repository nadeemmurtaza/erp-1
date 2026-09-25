import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SizeBiasListener } from './size-bias.listener';
import { SizeBiasService } from './size-bias.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('SizeBiasListener', () => {
  let listener: SizeBiasListener;
  let sizeBias: any;
  let prisma: any;

  beforeEach(async () => {
    sizeBias = { recompute: jest.fn().mockResolvedValue(undefined) };
    prisma = { returnRequestItem: { findMany: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SizeBiasListener,
        { provide: SizeBiasService, useValue: sizeBias },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    listener = module.get(SizeBiasListener);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  describe('onReviewModerated', () => {
    it('recomputes size bias for the moderated review\'s product', async () => {
      await listener.onReviewModerated({ reviewId: 'r1', productId: 'prod1', status: 'PUBLISHED' });

      expect(sizeBias.recompute).toHaveBeenCalledWith('prod1');
    });

    it('swallows a recompute failure rather than throwing', async () => {
      sizeBias.recompute.mockRejectedValue(new Error('db down'));

      await expect(
        listener.onReviewModerated({ reviewId: 'r1', productId: 'prod1', status: 'REJECTED' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('onReturnRequestStatusChanged', () => {
    it('recomputes for every distinct product on a brand-new return request', async () => {
      prisma.returnRequestItem.findMany.mockResolvedValue([
        { orderItem: { productId: 'prod1' } },
        { orderItem: { productId: 'prod2' } },
        { orderItem: { productId: 'prod1' } }, // duplicate product, same return
      ]);

      await listener.onReturnRequestStatusChanged({
        returnId: 'ret1',
        returnNumber: 'RET-1',
        orderId: 'order1',
        fromStatus: null,
        toStatus: 'REQUESTED',
        actorId: 'user1',
      });

      expect(sizeBias.recompute).toHaveBeenCalledTimes(2);
      expect(sizeBias.recompute).toHaveBeenCalledWith('prod1');
      expect(sizeBias.recompute).toHaveBeenCalledWith('prod2');
    });

    it('ignores a later status transition on the same return — the reason was already counted at filing', async () => {
      await listener.onReturnRequestStatusChanged({
        returnId: 'ret1',
        returnNumber: 'RET-1',
        orderId: 'order1',
        fromStatus: 'REQUESTED',
        toStatus: 'APPROVED',
        actorId: 'user1',
      });

      expect(prisma.returnRequestItem.findMany).not.toHaveBeenCalled();
      expect(sizeBias.recompute).not.toHaveBeenCalled();
    });

    it('skips a return line with no linked product rather than passing null through', async () => {
      prisma.returnRequestItem.findMany.mockResolvedValue([{ orderItem: { productId: null } }]);

      await listener.onReturnRequestStatusChanged({
        returnId: 'ret1',
        returnNumber: 'RET-1',
        orderId: 'order1',
        fromStatus: null,
        toStatus: 'REQUESTED',
        actorId: 'user1',
      });

      expect(sizeBias.recompute).not.toHaveBeenCalled();
    });
  });
});

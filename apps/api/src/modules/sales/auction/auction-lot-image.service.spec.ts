import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuctionLotImageService } from './auction-lot-image.service';

/**
 * WO-234.12 with the database and the storage driver mocked. The real lock,
 * the real count under it and ten uploads at once are `test/auction-lot-photos.e2e-spec.ts`.
 */
describe('AuctionLotImageService', () => {
  let service: AuctionLotImageService;
  let tx: any;
  let prisma: any;
  let storage: { putImage: jest.Mock; delete: jest.Mock };
  let audit: { record: jest.Mock };
  let auctionStatus: string;
  let lotStatus: string;
  let stored: Array<{ id: string; lotId: string; url: string; storageKey: string; order: number }>;
  let nextId: number;

  const file = { buffer: Buffer.from('img'), originalname: 'front.jpg', mimetype: 'image/jpeg' };

  beforeEach(() => {
    auctionStatus = 'DRAFT';
    lotStatus = 'PENDING';
    nextId = 1;
    stored = [];
    tx = {
      $queryRaw: jest.fn(async () => [{ status: auctionStatus }]),
      auctionLot: { findFirst: jest.fn(async () => ({ status: lotStatus })) },
      auctionLotImage: {
        count: jest.fn(async () => stored.length),
        create: jest.fn(async ({ data }: any) => {
          const row = { id: `i${nextId++}`, ...data };
          stored.push(row);
          return { id: row.id, url: row.url, order: row.order };
        }),
        findMany: jest.fn(async (args: any) => {
          const rows = [...stored].sort((a, b) => a.order - b.order);
          return args?.select?.storageKey ? rows : rows.map((row) => ({ id: row.id, url: row.url, order: row.order }));
        }),
        findFirst: jest.fn(async ({ where }: any) => stored.find((row) => row.id === where.id && row.lotId === where.lotId) ?? null),
        update: jest.fn(async ({ where, data }: any) => {
          const row = stored.find((candidate) => candidate.id === where.id)!;
          Object.assign(row, data);
          return row;
        }),
        delete: jest.fn(async ({ where }: any) => {
          stored = stored.filter((row) => row.id !== where.id);
        }),
      },
    };
    prisma = {
      auctionLot: {
        findFirst: jest.fn(async () => ({ status: lotStatus, auction: { status: auctionStatus }, _count: { images: stored.length } })),
      },
      $transaction: jest.fn(async (work: (client: unknown) => unknown) => work(tx)),
    };
    storage = {
      putImage: jest.fn(async () => ({ key: 'auction-lots/2026/10/k.webp', url: '/files/auction-lots/2026/10/k.webp', size: 10, contentType: 'image/webp' })),
      delete: jest.fn(async () => undefined),
    };
    audit = { record: jest.fn(async () => undefined) };
    service = new AuctionLotImageService(prisma, storage as never, audit as never);
  });

  describe('add', () => {
    it('stores the image in the lot folder, records it at the next position and audits it', async () => {
      const first = await service.add('a1', 'l1', file, 'staff');
      expect(first).toEqual({ id: 'i1', url: '/files/auction-lots/2026/10/k.webp', order: 0 });
      const second = await service.add('a1', 'l1', file, 'staff');
      expect(second.order).toBe(1);
      expect(storage.putImage.mock.calls[0][0]).toMatchObject({ folder: 'auction-lots', filename: 'front.jpg', contentType: 'image/jpeg' });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'auction.lot_photo_added', entity: 'AuctionLot', entityId: 'l1' }));
    });

    it('returns an id, an address and a position, and never the storage key', async () => {
      const added = await service.add('a1', 'l1', file, 'staff');
      expect(Object.keys(added).sort()).toEqual(['id', 'order', 'url']);
    });

    it('refuses the eleventh before storing anything', async () => {
      stored = Array.from({ length: 10 }, (_, index) => ({ id: `x${index}`, lotId: 'l1', url: 'u', storageKey: 'k', order: index }));
      await expect(service.add('a1', 'l1', file, 'staff')).rejects.toMatchObject({ response: { code: 'LOT_PHOTOS_FULL' } });
      expect(storage.putImage).not.toHaveBeenCalled();
    });

    it('removes the object again when the lot turns out to be full under the lock', async () => {
      // The cheap look saw room; the count under the lock does not.
      prisma.auctionLot.findFirst.mockResolvedValueOnce({ status: 'PENDING', auction: { status: 'DRAFT' }, _count: { images: 9 } });
      stored = Array.from({ length: 10 }, (_, index) => ({ id: `x${index}`, lotId: 'l1', url: 'u', storageKey: 'k', order: index }));
      await expect(service.add('a1', 'l1', file, 'staff')).rejects.toBeInstanceOf(ConflictException);
      expect(storage.delete).toHaveBeenCalledWith('auction-lots/2026/10/k.webp');
      expect(audit.record).not.toHaveBeenCalled();
    });

    it.each(['SCHEDULED', 'OPEN', 'CLOSED', 'CANCELLED'])('refuses a photo on a %s auction and stores nothing', async (status) => {
      auctionStatus = status;
      await expect(service.add('a1', 'l1', file, 'staff')).rejects.toBeInstanceOf(ConflictException);
      expect(storage.putImage).not.toHaveBeenCalled();
    });

    it('refuses a photo on a withdrawn lot', async () => {
      lotStatus = 'WITHDRAWN';
      await expect(service.add('a1', 'l1', file, 'staff')).rejects.toBeInstanceOf(ConflictException);
      expect(storage.putImage).not.toHaveBeenCalled();
    });

    it('is a 404 for a lot that is not in this auction', async () => {
      prisma.auctionLot.findFirst.mockResolvedValueOnce(null);
      await expect(service.add('a1', 'other', file, 'staff')).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.putImage).not.toHaveBeenCalled();
    });

    it('records nothing when the file is not an image', async () => {
      storage.putImage.mockRejectedValueOnce(new BadRequestException('That file is not a valid image.'));
      await expect(service.add('a1', 'l1', file, 'staff')).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.auctionLotImage.create).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('removes the stored object when recording fails, and still fails with the original reason', async () => {
      tx.auctionLotImage.create.mockRejectedValueOnce(new Error('database is down'));
      await expect(service.add('a1', 'l1', file, 'staff')).rejects.toThrow('database is down');
      expect(storage.delete).toHaveBeenCalledWith('auction-lots/2026/10/k.webp');
    });

    it('does not let a failed clean-up hide the real failure', async () => {
      tx.auctionLotImage.create.mockRejectedValueOnce(new Error('database is down'));
      storage.delete.mockRejectedValueOnce(new Error('bucket unreachable'));
      await expect(service.add('a1', 'l1', file, 'staff')).rejects.toThrow('database is down');
    });
  });

  describe('reorder', () => {
    beforeEach(() => {
      stored = ['a', 'b', 'c'].map((id, order) => ({ id, lotId: 'l1', url: `/f/${id}`, storageKey: `k-${id}`, order }));
    });

    it('writes the new positions and returns the lot’s photos in that order', async () => {
      const result = await service.reorder('a1', 'l1', ['c', 'a', 'b'], 'staff');
      expect(result.map((image) => image.id)).toEqual(['c', 'a', 'b']);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'auction.lot_photos_reordered' }));
    });

    it('refuses a list that is not exactly the lot’s photos, and writes nothing', async () => {
      await expect(service.reorder('a1', 'l1', ['a', 'b'], 'staff')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.reorder('a1', 'l1', ['a', 'b', 'zzz'], 'staff')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.reorder('a1', 'l1', ['a', 'a', 'b'], 'staff')).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.auctionLotImage.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('refuses on an auction that is no longer a draft', async () => {
      auctionStatus = 'SCHEDULED';
      await expect(service.reorder('a1', 'l1', ['c', 'a', 'b'], 'staff')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      stored = ['a', 'b', 'c'].map((id, order) => ({ id, lotId: 'l1', url: `/f/${id}`, storageKey: `k-${id}`, order }));
    });

    it('removes the row, closes the gap, deletes the object and returns what is left', async () => {
      const left = await service.remove('a1', 'l1', 'a', 'staff');
      expect(left).toEqual([
        { id: 'b', url: '/f/b', order: 0 },
        { id: 'c', url: '/f/c', order: 1 },
      ]);
      expect(storage.delete).toHaveBeenCalledWith('k-a');
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'auction.lot_photo_removed', data: expect.objectContaining({ imageId: 'a' }) }));
    });

    it('is a 404 for a photo that is not on this lot, and for one already removed', async () => {
      await expect(service.remove('a1', 'l1', 'nope', 'staff')).rejects.toBeInstanceOf(NotFoundException);
      await service.remove('a1', 'l1', 'a', 'staff');
      await expect(service.remove('a1', 'l1', 'a', 'staff')).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.delete).toHaveBeenCalledTimes(1);
    });

    it('still removes the row when the object cannot be deleted', async () => {
      storage.delete.mockRejectedValueOnce(new Error('bucket unreachable'));
      const left = await service.remove('a1', 'l1', 'b', 'staff');
      expect(left.map((image) => image.id)).toEqual(['a', 'c']);
    });

    it('refuses on an auction that is no longer a draft, and keeps the photo', async () => {
      auctionStatus = 'OPEN';
      await expect(service.remove('a1', 'l1', 'a', 'staff')).rejects.toBeInstanceOf(ConflictException);
      expect(stored).toHaveLength(3);
      expect(storage.delete).not.toHaveBeenCalled();
    });
  });
});

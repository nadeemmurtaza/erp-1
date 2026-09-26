import { NotFoundException } from '@nestjs/common';
import { CategoryPresetService } from './category-preset.service';

describe('CategoryPresetService', () => {
  let prisma: any;
  let tx: any;
  let audit: any;
  let service: CategoryPresetService;

  beforeEach(() => {
    tx = { category: { findUnique: jest.fn(), create: jest.fn() } };
    prisma = {
      categoryPreset: { findMany: jest.fn(), findUnique: jest.fn() },
      category: { findMany: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn((work: (client: unknown) => unknown) => work(tx)),
    };
    audit = { record: jest.fn() };
    service = new CategoryPresetService(prisma, audit);
  });

  describe('preview', () => {
    it('throws NotFoundException for an unknown preset key', async () => {
      prisma.categoryPreset.findUnique.mockResolvedValue(null);
      await expect(service.preview('missing')).rejects.toThrow(NotFoundException);
    });

    it('names every collision by node name and counts the rest as creatable', async () => {
      prisma.categoryPreset.findUnique.mockResolvedValue({
        treeJson: [{ name: 'Existing Node', children: [{ name: 'New Child' }] }, { name: 'Another New Node' }],
      });
      prisma.category.findMany.mockResolvedValue([{ slug: 'existing-node' }]);

      const result = await service.preview('apparel');

      expect(result.collisions).toEqual(['Existing Node']);
      expect(result.created).toBe(2); // New Child + Another New Node
      expect(result.skipped).toBe(1);
    });
  });

  describe('apply', () => {
    it('throws NotFoundException for an unknown preset key', async () => {
      prisma.categoryPreset.findUnique.mockResolvedValue(null);
      await expect(service.apply({ id: 'user-1' } as any, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('creates a fresh tree end to end and audits the result', async () => {
      prisma.categoryPreset.findUnique.mockResolvedValue({
        id: 'preset-1',
        treeJson: [{ name: 'Top', children: [{ name: 'Child' }] }],
      });
      tx.category.findUnique.mockResolvedValue(null);
      tx.category.create
        .mockResolvedValueOnce({ id: 'cat-top' })
        .mockResolvedValueOnce({ id: 'cat-child' });

      const result = await service.apply({ id: 'user-1' } as any, 'apparel');

      expect(result).toEqual({ created: 2, skipped: 0 });
      expect(tx.category.create).toHaveBeenCalledTimes(2);
      // The child is created under the parent's own new id, never null.
      expect(tx.category.create.mock.calls[1][0].data.parentId).toBe('cat-top');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'catalog.category_preset_applied', data: expect.objectContaining({ created: 2, skipped: 0 }) }),
      );
    });

    it('reuses an existing category by slug instead of recreating it, and still attaches its children', async () => {
      prisma.categoryPreset.findUnique.mockResolvedValue({
        id: 'preset-1',
        treeJson: [{ name: 'Existing Node', children: [{ name: 'New Child' }] }],
      });
      tx.category.findUnique
        .mockResolvedValueOnce({ id: 'existing-id' }) // "Existing Node" already exists
        .mockResolvedValueOnce(null); // "New Child" does not
      tx.category.create.mockResolvedValueOnce({ id: 'cat-child' });

      const result = await service.apply({ id: 'user-1' } as any, 'apparel');

      expect(result).toEqual({ created: 1, skipped: 1 });
      // The child attaches under the EXISTING node's own id, never orphaned.
      expect(tx.category.create).toHaveBeenCalledTimes(1);
      expect(tx.category.create.mock.calls[0][0].data.parentId).toBe('existing-id');
    });

    it('re-applying an already-fully-applied preset creates zero new categories', async () => {
      prisma.categoryPreset.findUnique.mockResolvedValue({
        id: 'preset-1',
        treeJson: [{ name: 'Top', children: [{ name: 'Child' }] }],
      });
      tx.category.findUnique.mockResolvedValue({ id: 'already-there' });

      const result = await service.apply({ id: 'user-1' } as any, 'apparel');

      expect(result).toEqual({ created: 0, skipped: 2 });
      expect(tx.category.create).not.toHaveBeenCalled();
    });
  });
});

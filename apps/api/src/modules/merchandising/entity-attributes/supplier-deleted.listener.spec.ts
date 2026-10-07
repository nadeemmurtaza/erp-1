import { EntityAttributeSupplierDeletedListener } from './supplier-deleted.listener';
import type { EntityAttributeService } from './entity-attributes.service';

describe('EntityAttributeSupplierDeletedListener — WO-140.3', () => {
  it('clears every EntityAttribute row for the deleted supplier', async () => {
    const entityAttributes = { deleteAll: jest.fn().mockResolvedValue(undefined) } as unknown as EntityAttributeService;
    const listener = new EntityAttributeSupplierDeletedListener(entityAttributes);

    await listener.onSupplierDeleted({ supplierId: 'sup1' });

    expect(entityAttributes.deleteAll).toHaveBeenCalledWith('Supplier', 'sup1');
  });
});

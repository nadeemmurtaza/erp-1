import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SearchReindexListener } from './search-reindex.listener';
import { SearchService } from './search.service';

describe('SearchReindexListener', () => {
  let listener: SearchReindexListener;
  let search: { reindexProduct: jest.Mock; invalidateEmbedding: jest.Mock };

  beforeEach(async () => {
    search = { reindexProduct: jest.fn().mockResolvedValue(undefined), invalidateEmbedding: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchReindexListener, { provide: SearchService, useValue: search }],
    }).compile();

    listener = module.get(SearchReindexListener);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  it('reindexes the tsvector and invalidates the embedding on every product change', async () => {
    await listener.onProductChanged({ productId: 'p1' });

    expect(search.reindexProduct).toHaveBeenCalledWith('p1');
    expect(search.invalidateEmbedding).toHaveBeenCalledWith('p1');
  });

  it('never throws when reindexing fails — logs instead', async () => {
    search.reindexProduct.mockRejectedValue(new Error('db hiccup'));

    await expect(listener.onProductChanged({ productId: 'p1' })).resolves.toBeUndefined();
  });
});

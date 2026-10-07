import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SearchEmbeddingCron } from './search-embedding.cron';
import { SearchService } from './search.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';

describe('SearchEmbeddingCron', () => {
  let cron: SearchEmbeddingCron;
  let search: { embedPendingTranslations: jest.Mock };
  let settings: { get: jest.Mock };

  beforeEach(async () => {
    search = { embedPendingTranslations: jest.fn() };
    settings = { get: jest.fn().mockResolvedValue(20) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchEmbeddingCron,
        { provide: SearchService, useValue: search },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();

    cron = module.get(SearchEmbeddingCron);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  it('reads the batch size from settings and passes it through', async () => {
    search.embedPendingTranslations.mockResolvedValue(5);

    await cron.embedPending();

    expect(settings.get).toHaveBeenCalledWith(SettingKey.SearchEmbeddingBatchSize);
    expect(search.embedPendingTranslations).toHaveBeenCalledWith(20);
  });

  it('does not throw on a zero-embedded run (no provider configured, or nothing pending)', async () => {
    search.embedPendingTranslations.mockResolvedValue(0);

    await expect(cron.embedPending()).resolves.toBeUndefined();
  });
});

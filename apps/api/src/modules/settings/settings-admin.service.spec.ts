import { Test, TestingModule } from '@nestjs/testing';
import { SettingsAdminService } from './settings-admin.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { AppConfigService } from '../../core/config/app-config.service';
import { AiService } from '../../core/ai/ai.service';

describe('SettingsAdminService — AI settings', () => {
  let service: SettingsAdminService;
  let settings: any;
  let config: any;
  let ai: any;

  beforeEach(async () => {
    settings = {
      get: jest.fn(async (key: string) => {
        if (key === SettingKey.AiMonthlyBudgetPaisa) return null;
        if (key === SettingKey.AiUsdToPkrRate) return 280;
        return null;
      }),
      set: jest.fn().mockResolvedValue(undefined),
    };

    config = { isAiProviderEnabled: jest.fn().mockReturnValue(false) };

    ai = {
      isAvailable: jest.fn().mockReturnValue(false),
      monthToDateSpendPaisa: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsAdminService,
        { provide: PrismaService, useValue: {} },
        { provide: SettingsService, useValue: settings },
        { provide: AppConfigService, useValue: config },
        { provide: AiService, useValue: ai },
      ],
    }).compile();

    service = module.get(SettingsAdminService);
  });

  describe('getAi', () => {
    it('reports every provider off and every capability unavailable with an empty allowlist', async () => {
      const status = await service.getAi();

      expect(status).toEqual({
        providers: { anthropic: false, openai: false },
        capabilities: { complete: false, embed: false, vision: false },
        monthlyBudgetPaisa: null,
        usdToPkrRate: 280,
        monthToDateSpendPaisa: 0,
      });
    });

    it('reflects an enabled provider and its capabilities', async () => {
      config.isAiProviderEnabled.mockImplementation((name: string) => name === 'anthropic');
      ai.isAvailable.mockImplementation((capability: string) => capability === 'complete' || capability === 'vision');
      ai.monthToDateSpendPaisa.mockResolvedValue(4200);

      const status = await service.getAi();

      expect(status.providers).toEqual({ anthropic: true, openai: false });
      expect(status.capabilities).toEqual({ complete: true, embed: false, vision: true });
      expect(status.monthToDateSpendPaisa).toBe(4200);
    });

    it('reports the configured monthly budget when one is set', async () => {
      settings.get.mockImplementation(async (key: string) => {
        if (key === SettingKey.AiMonthlyBudgetPaisa) return 500_00;
        if (key === SettingKey.AiUsdToPkrRate) return 285;
        return null;
      });

      const status = await service.getAi();

      expect(status.monthlyBudgetPaisa).toBe(500_00);
      expect(status.usdToPkrRate).toBe(285);
    });
  });

  describe('updateAi', () => {
    it('sets the monthly budget and rate, then returns the refreshed status', async () => {
      const result = await service.updateAi({ monthlyBudgetPaisa: 1000_00, usdToPkrRate: 290 });

      expect(settings.set).toHaveBeenCalledWith(SettingKey.AiMonthlyBudgetPaisa, 1000_00);
      expect(settings.set).toHaveBeenCalledWith(SettingKey.AiUsdToPkrRate, 290);
      expect(result).toEqual(expect.objectContaining({ monthlyBudgetPaisa: null })); // settings mock still returns its own stub value
    });

    it('clearing the budget (null) uncaps it — omitting the field leaves it untouched', async () => {
      await service.updateAi({ monthlyBudgetPaisa: null });

      expect(settings.set).toHaveBeenCalledWith(SettingKey.AiMonthlyBudgetPaisa, null);
      expect(settings.set).not.toHaveBeenCalledWith(SettingKey.AiUsdToPkrRate, expect.anything());
    });

    it('updates nothing when the patch is empty', async () => {
      await service.updateAi({});

      expect(settings.set).not.toHaveBeenCalled();
    });
  });
});

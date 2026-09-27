import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SettingKey } from '../settings/settings.defaults';
import { AppConfigService } from '../config/app-config.service';
import { AiCallKind, AiFeature } from '../prisma/client';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAiProvider } from './providers/openai.provider';

describe('AiService', () => {
  let prisma: any;
  let settings: any;
  let anthropic: any;
  let openai: any;

  const buildConfig = (aiProviders: string[]) => ({
    get: jest.fn((key: string) => {
      if (key === 'AI_PROVIDERS') return aiProviders;
      return undefined;
    }),
  });

  const buildService = async (aiProviders: string[]): Promise<AiService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: AppConfigService, useValue: buildConfig(aiProviders) },
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
        CircuitBreakerService,
        { provide: AnthropicProvider, useValue: anthropic },
        { provide: OpenAiProvider, useValue: openai },
      ],
    }).compile();

    return module.get<AiService>(AiService);
  };

  beforeEach(() => {
    prisma = {
      aiUsageLog: {
        create: jest.fn().mockResolvedValue({}),
        aggregate: jest.fn().mockResolvedValue({ _sum: { costPaisa: 0 } }),
      },
    };

    settings = {
      get: jest.fn(async (key: string) => {
        if (key === SettingKey.AiMonthlyBudgetPaisa) return null;
        if (key === SettingKey.AiUsdToPkrRate) return 280;
        if (key === SettingKey.StoreTimezone) return 'Asia/Karachi';
        return null;
      }),
    };

    anthropic = {
      key: 'anthropic',
      supportsEmbeddings: false,
      supportsVision: true,
      complete: jest.fn(),
      describeImage: jest.fn(),
    };

    openai = {
      key: 'openai',
      supportsEmbeddings: true,
      supportsVision: false,
      complete: jest.fn(),
      embed: jest.fn(),
    };

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  describe('isAvailable', () => {
    it('is false for every capability with an empty AI_PROVIDERS allowlist', async () => {
      const service = await buildService([]);

      expect(service.isAvailable('complete')).toBe(false);
      expect(service.isAvailable('embed')).toBe(false);
      expect(service.isAvailable('vision')).toBe(false);
    });

    it('is true for complete once any provider is registered', async () => {
      const service = await buildService(['anthropic']);

      expect(service.isAvailable('complete')).toBe(true);
    });

    it('is true for embed only once a provider supporting embeddings is registered', async () => {
      const anthropicOnly = await buildService(['anthropic']);
      expect(anthropicOnly.isAvailable('embed')).toBe(false);

      const withOpenAi = await buildService(['anthropic', 'openai']);
      expect(withOpenAi.isAvailable('embed')).toBe(true);
    });

    it('is true for vision only once a provider supporting vision is registered', async () => {
      const openaiOnly = await buildService(['openai']);
      expect(openaiOnly.isAvailable('vision')).toBe(false);

      const withAnthropic = await buildService(['anthropic', 'openai']);
      expect(withAnthropic.isAvailable('vision')).toBe(true);
    });
  });

  describe('no provider configured', () => {
    it('complete() returns null and never touches Prisma', async () => {
      const service = await buildService([]);

      const result = await service.complete(AiFeature.SEO_COPY, { prompt: 'hi' });

      expect(result).toBeNull();
      expect(prisma.aiUsageLog.create).not.toHaveBeenCalled();
    });

    it('embed() returns null when no enabled provider supports embeddings', async () => {
      const service = await buildService(['anthropic']);

      const result = await service.embed(AiFeature.SEMANTIC_SEARCH, ['text']);

      expect(result).toBeNull();
      expect(prisma.aiUsageLog.create).not.toHaveBeenCalled();
    });

    it('describeImage() returns null when no enabled provider supports vision', async () => {
      const service = await buildService(['openai']);

      const result = await service.describeImage(AiFeature.ALT_TEXT, 'https://cdn/img.jpg', 'describe it');

      expect(result).toBeNull();
      expect(prisma.aiUsageLog.create).not.toHaveBeenCalled();
    });
  });

  describe('complete', () => {
    it('returns the provider result and logs a successful AiUsageLog row', async () => {
      anthropic.complete.mockResolvedValue({
        text: 'A lovely lawn suit.',
        inputTokens: 100,
        outputTokens: 50,
        model: 'claude-sonnet-5',
      });
      const service = await buildService(['anthropic']);

      const result = await service.complete(AiFeature.SEO_COPY, { prompt: 'describe this product' });

      expect(result?.text).toBe('A lovely lawn suit.');
      expect(prisma.aiUsageLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          feature: AiFeature.SEO_COPY,
          kind: AiCallKind.COMPLETION,
          provider: 'anthropic',
          model: 'claude-sonnet-5',
          inputTokens: 100,
          outputTokens: 50,
          succeeded: true,
          costPaisa: expect.any(Number),
        }),
      });
      const loggedCostPaisa = prisma.aiUsageLog.create.mock.calls[0][0].data.costPaisa;
      expect(loggedCostPaisa).toBeGreaterThan(0);
    });

    it('returns null and logs a failed AiUsageLog row when the provider rejects', async () => {
      anthropic.complete.mockRejectedValue(new Error('vendor is down'));
      const service = await buildService(['anthropic']);

      const result = await service.complete(AiFeature.SEO_COPY, { prompt: 'describe this product' });

      expect(result).toBeNull();
      expect(prisma.aiUsageLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          feature: AiFeature.SEO_COPY,
          kind: AiCallKind.COMPLETION,
          provider: 'anthropic',
          succeeded: false,
          costPaisa: 0,
          errorMessage: 'vendor is down',
        }),
      });
    });

    it('WO-38.1/38.2 — degradation matrix row "AiProvider down": once the circuit opens, the provider is never called again and every AI feature keeps returning null (its stated non-AI fallback) instead of retrying a dependency already known to be down', async () => {
      anthropic.complete.mockRejectedValue(new Error('vendor is down'));
      const service = await buildService(['anthropic']);

      // Default failure threshold is 5 — five real attempts hit the provider.
      for (let i = 0; i < 5; i++) {
        await expect(service.complete(AiFeature.SEO_COPY, { prompt: 'x' })).resolves.toBeNull();
      }
      expect(anthropic.complete).toHaveBeenCalledTimes(5);

      // The circuit is now OPEN: a further call fails fast without ever
      // reaching the provider again, and AiService's own contract still
      // holds — the caller gets null, never a thrown CircuitOpenError.
      const result = await service.complete(AiFeature.SEO_COPY, { prompt: 'x' });
      expect(result).toBeNull();
      expect(anthropic.complete).toHaveBeenCalledTimes(5);
    });

    it('picks the first registered provider that supports the capability, in registration order', async () => {
      anthropic.complete.mockResolvedValue({ text: 'from anthropic', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-5' });
      openai.complete.mockResolvedValue({ text: 'from openai', inputTokens: 1, outputTokens: 1, model: 'gpt-4o-mini' });
      const service = await buildService(['anthropic', 'openai']);

      const result = await service.complete(AiFeature.SEO_COPY, { prompt: 'hi' });

      expect(result?.text).toBe('from anthropic');
      expect(openai.complete).not.toHaveBeenCalled();
    });
  });

  describe('embed', () => {
    it('routes to the provider that supports embeddings even when it registered second', async () => {
      openai.embed.mockResolvedValue({ vectors: [[0.1, 0.2]], inputTokens: 10, model: 'text-embedding-3-small' });
      const service = await buildService(['anthropic', 'openai']);

      const result = await service.embed(AiFeature.SEMANTIC_SEARCH, ['a product description']);

      expect(result?.vectors).toEqual([[0.1, 0.2]]);
      expect(prisma.aiUsageLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: AiCallKind.EMBEDDING, provider: 'openai', outputTokens: 0 }),
      });
    });
  });

  describe('underBudget', () => {
    it('allows a call when AiMonthlyBudgetPaisa is null (uncapped)', async () => {
      anthropic.complete.mockResolvedValue({ text: 'ok', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-5' });
      prisma.aiUsageLog.aggregate.mockResolvedValue({ _sum: { costPaisa: 999_999_00 } });
      const service = await buildService(['anthropic']);

      const result = await service.complete(AiFeature.SEO_COPY, { prompt: 'hi' });

      expect(result).not.toBeNull();
    });

    it('blocks a call once month-to-date spend meets the budget, without invoking the provider', async () => {
      settings.get.mockImplementation(async (key: string) => {
        if (key === SettingKey.AiMonthlyBudgetPaisa) return 1000;
        if (key === SettingKey.AiUsdToPkrRate) return 280;
        if (key === SettingKey.StoreTimezone) return 'Asia/Karachi';
        return null;
      });
      prisma.aiUsageLog.aggregate.mockResolvedValue({ _sum: { costPaisa: 1000 } });
      const service = await buildService(['anthropic']);

      const result = await service.complete(AiFeature.SEO_COPY, { prompt: 'hi' });

      expect(result).toBeNull();
      expect(anthropic.complete).not.toHaveBeenCalled();
      expect(prisma.aiUsageLog.create).not.toHaveBeenCalled();
    });

    it('allows a call while month-to-date spend is still below the budget', async () => {
      settings.get.mockImplementation(async (key: string) => {
        if (key === SettingKey.AiMonthlyBudgetPaisa) return 1000;
        if (key === SettingKey.AiUsdToPkrRate) return 280;
        if (key === SettingKey.StoreTimezone) return 'Asia/Karachi';
        return null;
      });
      prisma.aiUsageLog.aggregate.mockResolvedValue({ _sum: { costPaisa: 999 } });
      anthropic.complete.mockResolvedValue({ text: 'ok', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-5' });
      const service = await buildService(['anthropic']);

      const result = await service.complete(AiFeature.SEO_COPY, { prompt: 'hi' });

      expect(result).not.toBeNull();
    });
  });

  describe('monthToDateSpendPaisa', () => {
    it('returns 0 when no AiUsageLog rows exist yet this month', async () => {
      prisma.aiUsageLog.aggregate.mockResolvedValue({ _sum: { costPaisa: null } });
      const service = await buildService([]);

      const spend = await service.monthToDateSpendPaisa();

      expect(spend).toBe(0);
    });

    it('returns the aggregated sum when rows exist', async () => {
      prisma.aiUsageLog.aggregate.mockResolvedValue({ _sum: { costPaisa: 4200 } });
      const service = await buildService([]);

      const spend = await service.monthToDateSpendPaisa();

      expect(spend).toBe(4200);
    });
  });
});

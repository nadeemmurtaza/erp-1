import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiCallKind, AiFeature } from '../prisma/client';
import { SettingsService } from '../settings/settings.service';
import { SettingKey } from '../settings/settings.defaults';
import { startOfShopMonth } from '../time/shop-time';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAiProvider } from './providers/openai.provider';
import type {
  AiProvider,
  CompletionInput,
  CompletionResult,
  DescribeImageResult,
  EmbeddingResult,
} from './ai-provider';

const CALL_TIMEOUT_MS = 30_000;

/**
 * Rough USD-per-million-token rates, for budget alerting only — not an
 * invoice reconciliation tool (a provider's real bill is the source of
 * truth for what a shop actually owes). Unknown models fall back to a
 * conservative estimate rather than logging a cost of zero, which would
 * silently defeat the whole point of a budget cap.
 */
const PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  'claude-sonnet-5': { inputPerM: 3, outputPerM: 15 },
  'claude-opus-5-5': { inputPerM: 15, outputPerM: 75 },
  'claude-haiku-4-5-20251001': { inputPerM: 0.8, outputPerM: 4 },
  'gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.6 },
  'gpt-4o': { inputPerM: 2.5, outputPerM: 10 },
  'text-embedding-3-small': { inputPerM: 0.02, outputPerM: 0 },
};
const FALLBACK_PRICING = { inputPerM: 5, outputPerM: 15 };

export type AiCapability = 'complete' | 'embed' | 'vision';

/**
 * Front door for every AI call in the codebase (09-ai-layer.md). Callers
 * never touch a provider directly — this is what enforces the phase's two
 * non-negotiables: (1) every call is logged and stopped once the monthly
 * budget is spent, (2) every call has a timeout, and every caller gets
 * `null` on any failure (no provider configured, budget exhausted, timeout,
 * a vendor error) rather than a thrown exception — "every AI call has a
 * timeout and a fallback that is the current non-AI behaviour" is a
 * contract on THIS class, not something each of the ten features has to
 * reimplement.
 *
 * Provider order is registration order (AnthropicProvider, then
 * OpenAiProvider) filtered by the AI_PROVIDERS allowlist — the first
 * enabled provider that supports the requested capability wins. A
 * deployment that wants OpenAI to win for text too simply omits
 * `anthropic` from the allowlist; there is no separate priority setting to
 * keep in sync with it.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly providers: AiProvider[] = [];

  constructor(
    config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    anthropic: AnthropicProvider,
    openai: OpenAiProvider,
  ) {
    for (const provider of [anthropic, openai]) {
      if (config.get('AI_PROVIDERS').includes(provider.key)) this.providers.push(provider);
    }
    if (this.providers.length === 0) {
      this.logger.log('No AI providers enabled — every AI feature runs its pre-AI fallback.');
    }
  }

  /** For a feature to check before rendering an AI-powered button at all (House Rule 8). */
  isAvailable(capability: AiCapability = 'complete'): boolean {
    if (capability === 'embed') return this.providers.some((p) => p.supportsEmbeddings);
    if (capability === 'vision') return this.providers.some((p) => p.supportsVision);
    return this.providers.length > 0;
  }

  async complete(feature: AiFeature, input: CompletionInput): Promise<CompletionResult | null> {
    const provider = this.providers[0];
    if (!provider) return null;
    if (!(await this.underBudget())) return null;

    try {
      const result = await withTimeout(provider.complete(input), CALL_TIMEOUT_MS);
      await this.logUsage(feature, AiCallKind.COMPLETION, provider, result.model, result.inputTokens, result.outputTokens);
      return result;
    } catch (error) {
      await this.logFailure(feature, AiCallKind.COMPLETION, provider, error);
      return null;
    }
  }

  async embed(feature: AiFeature, texts: string[]): Promise<EmbeddingResult | null> {
    const provider = this.providers.find((p) => p.supportsEmbeddings && p.embed);
    if (!provider?.embed) return null;
    if (!(await this.underBudget())) return null;

    try {
      const result = await withTimeout(provider.embed(texts), CALL_TIMEOUT_MS);
      await this.logUsage(feature, AiCallKind.EMBEDDING, provider, result.model, result.inputTokens, 0);
      return result;
    } catch (error) {
      await this.logFailure(feature, AiCallKind.EMBEDDING, provider, error);
      return null;
    }
  }

  async describeImage(
    feature: AiFeature,
    imageUrl: string,
    prompt: string,
  ): Promise<DescribeImageResult | null> {
    const provider = this.providers.find((p) => p.supportsVision && p.describeImage);
    if (!provider?.describeImage) return null;
    if (!(await this.underBudget())) return null;

    try {
      const result = await withTimeout(provider.describeImage(imageUrl, prompt), CALL_TIMEOUT_MS);
      await this.logUsage(feature, AiCallKind.VISION, provider, result.model, result.inputTokens, result.outputTokens);
      return result;
    } catch (error) {
      await this.logFailure(feature, AiCallKind.VISION, provider, error);
      return null;
    }
  }

  /** This shop month's total AI spend, in paisa — shown on the /admin/ai screen. */
  async monthToDateSpendPaisa(): Promise<number> {
    const timeZone = await this.settings.get<string>(SettingKey.StoreTimezone);
    const startOfMonth = startOfShopMonth(new Date(), timeZone);
    const result = await this.prisma.aiUsageLog.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _sum: { costPaisa: true },
    });
    return result._sum.costPaisa ?? 0;
  }

  private async underBudget(): Promise<boolean> {
    const budget = await this.settings.get<number | null>(SettingKey.AiMonthlyBudgetPaisa);
    if (budget === null || budget === undefined) return true;
    const spent = await this.monthToDateSpendPaisa();
    if (spent >= budget) {
      this.logger.warn(`AI monthly budget spent (Rs ${(spent / 100).toFixed(0)} of Rs ${(budget / 100).toFixed(0)}) — every AI call is falling back until it resets.`);
      return false;
    }
    return true;
  }

  private async logUsage(
    feature: AiFeature,
    kind: AiCallKind,
    provider: AiProvider,
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    const costPaisa = await this.estimateCostPaisa(model, inputTokens, outputTokens);
    await this.prisma.aiUsageLog.create({
      data: { feature, kind, provider: provider.key, model, inputTokens, outputTokens, costPaisa, succeeded: true },
    });
  }

  private async logFailure(feature: AiFeature, kind: AiCallKind, provider: AiProvider, error: unknown): Promise<void> {
    this.logger.error(`${feature} (${kind}) via ${provider.key} failed: ${describe(error)}`);
    await this.prisma.aiUsageLog.create({
      data: {
        feature,
        kind,
        provider: provider.key,
        model: 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        costPaisa: 0,
        succeeded: false,
        errorMessage: describe(error).slice(0, 500),
      },
    });
  }

  private async estimateCostPaisa(model: string, inputTokens: number, outputTokens: number): Promise<number> {
    const rate = PRICING[model] ?? FALLBACK_PRICING;
    const usd = (inputTokens / 1_000_000) * rate.inputPerM + (outputTokens / 1_000_000) * rate.outputPerM;
    const usdToPkr = await this.settings.get<number>(SettingKey.AiUsdToPkrRate);
    return Math.round(usd * usdToPkr * 100); // paisa
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`AI call timed out after ${ms}ms`)), ms);
    }),
  ]);
}

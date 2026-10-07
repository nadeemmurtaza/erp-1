import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../../core/ai/ai.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { AiFeature } from '../../../core/prisma/client';

/** Only these three, matching Review.fitFeedback's own free-text vocabulary — never a value SizeBiasService (measurements module) wouldn't already recognise. */
const FIT_SIGNALS = ['too_small', 'true_to_size', 'too_large'] as const;
type FitSignal = (typeof FIT_SIGNALS)[number];

/** How many of the most recent published reviews go into one summarisation call — bounds token cost regardless of how many thousand reviews a popular product accumulates. */
const MAX_REVIEWS_PER_SUMMARY = 50;

const SYSTEM_PROMPT = [
  'You summarise customer reviews for a Pakistani apparel retailer.',
  'Use ONLY what the reviews given to you actually say. Never invent a complaint, a compliment, or a fit opinion that is not reflected in the text given.',
  'If the reviews do not give you enough to say something specific, say less rather than guessing.',
  'Reply with a single JSON object of exactly this shape and nothing else — no markdown, no prose outside the JSON:',
  '{"summaryText": string, "summaryTextUr": string, "fitSignal": "too_small" | "true_to_size" | "too_large" | null, "qualitySignal": string | null, "commonComplaints": string[]}',
  '"summaryText" is one short sentence a shopper reads above the review list, e.g. "Most customers say it runs small" or "Customers love the fabric quality" — only when the reviews actually support it, otherwise a neutral one-line summary.',
  '"summaryTextUr" is the same sentence, naturally written in Urdu — not a literal word-for-word translation, but the same claim, since Urdu-reading shoppers see this line too.',
  '"fitSignal" is set only when several reviews clearly agree on fit; otherwise null.',
  '"qualitySignal" is one short phrase about build/fabric/stitching quality, or null if reviews say nothing about it.',
  '"commonComplaints" lists at most 3 short phrases, each raised by more than one review — an empty array if nothing recurs.',
].join('\n');

interface ParsedSummary {
  summaryText: string;
  summaryTextUr: string | null;
  fitSignal: FitSignal | null;
  qualitySignal: string | null;
  commonComplaints: string[];
}

/**
 * WO-9.9 (09-ai-layer.md) — "'Most customers say it runs small' above the
 * review list, regenerated when review count crosses a threshold and
 * cached." No approval queue: ProductReviewSummary carries no PENDING/
 * APPROVED status (unlike ProductAiSuggestion, WO-9.1) — the schema's own
 * shape is the design decision. Safety is strict grounding instead: the
 * prompt forbids inventing anything the given reviews don't say, and the
 * whole thing degrades to "no summary" (the storefront shows nothing extra)
 * on any AI failure, never a stale or fabricated line.
 */
@Injectable()
export class ReviewSummaryService {
  private readonly logger = new Logger(ReviewSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly ai: AiService,
  ) {}

  /** Called after every review is moderated to PUBLISHED — cheap (one count query) when the threshold hasn't been crossed, so it costs nothing to check on every single review. */
  async maybeRegenerate(productId: string): Promise<void> {
    const threshold = await this.settings.get<number>(SettingKey.ReviewSummaryThreshold);
    if (threshold <= 0) return;

    const [currentCount, existing] = await Promise.all([
      this.prisma.review.count({ where: { productId, status: 'PUBLISHED' } }),
      this.prisma.productReviewSummary.findUnique({ where: { productId }, select: { reviewCountAtGeneration: true } }),
    ]);

    const lastCount = existing?.reviewCountAtGeneration ?? 0;
    const crossedNextMultiple = Math.floor(currentCount / threshold) > Math.floor(lastCount / threshold);
    if (currentCount < threshold || !crossedNextMultiple) return;

    await this.regenerate(productId, currentCount);
  }

  private async regenerate(productId: string, currentCount: number): Promise<void> {
    if (!this.ai.isAvailable('complete')) {
      this.logger.log(`Skipping review summary for product ${productId} — no AI provider configured.`);
      return;
    }

    const reviews = await this.prisma.review.findMany({
      where: { productId, status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      take: MAX_REVIEWS_PER_SUMMARY,
      select: { rating: true, title: true, body: true, fitFeedback: true },
    });
    if (reviews.length === 0) return;

    const result = await this.ai.complete(AiFeature.REVIEW_SUMMARY, {
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(reviews),
      jsonMode: true,
      maxTokens: 400,
      temperature: 0.3,
    });
    if (!result) {
      this.logger.warn(`Review summary AI call failed for product ${productId} — leaving the cached summary as-is.`);
      return;
    }

    const parsed = parseSummary(result.text);
    if (!parsed) {
      this.logger.warn(`Review summary for product ${productId} returned unparseable output — leaving the cached summary as-is.`);
      return;
    }

    await this.prisma.productReviewSummary.upsert({
      where: { productId },
      create: {
        productId,
        summaryText: parsed.summaryText,
        summaryTextUr: parsed.summaryTextUr,
        fitSignal: parsed.fitSignal,
        qualitySignal: parsed.qualitySignal,
        commonComplaints: parsed.commonComplaints,
        reviewCountAtGeneration: currentCount,
      },
      update: {
        summaryText: parsed.summaryText,
        summaryTextUr: parsed.summaryTextUr,
        fitSignal: parsed.fitSignal,
        qualitySignal: parsed.qualitySignal,
        commonComplaints: parsed.commonComplaints,
        reviewCountAtGeneration: currentCount,
        generatedAt: new Date(),
      },
    });
  }

  getSummary(productId: string) {
    return this.prisma.productReviewSummary.findUnique({ where: { productId } });
  }
}

function buildPrompt(reviews: Array<{ rating: number; title: string | null; body: string | null; fitFeedback: string | null }>): string {
  const lines = reviews.map((review, index) => {
    const parts = [`Review ${index + 1}: ${review.rating}/5 stars`];
    if (review.title?.trim()) parts.push(`"${review.title.trim()}"`);
    if (review.body?.trim()) parts.push(review.body.trim());
    if (review.fitFeedback) parts.push(`(fit feedback: ${review.fitFeedback})`);
    return parts.join(' — ');
  });
  return lines.join('\n');
}

function parseSummary(text: string): ParsedSummary | null {
  const candidate = extractJsonObject(text);
  if (!candidate) return null;

  try {
    const value = JSON.parse(candidate) as unknown;
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;

    if (typeof record.summaryText !== 'string' || !record.summaryText.trim()) return null;
    // summaryTextUr is best-effort: an English summary the model failed to
    // also translate is still worth caching — the storefront falls back to
    // English for that one product rather than showing nothing at all.
    const summaryTextUr =
      typeof record.summaryTextUr === 'string' && record.summaryTextUr.trim() ? record.summaryTextUr.trim().slice(0, 300) : null;

    const fitSignal = record.fitSignal;
    if (fitSignal !== null && !FIT_SIGNALS.includes(fitSignal as FitSignal)) return null;

    const qualitySignal = typeof record.qualitySignal === 'string' ? record.qualitySignal : null;

    const commonComplaints = Array.isArray(record.commonComplaints)
      ? record.commonComplaints.filter((item): item is string => typeof item === 'string').slice(0, 3)
      : [];

    return {
      summaryText: record.summaryText.trim().slice(0, 300),
      summaryTextUr,
      fitSignal: (fitSignal as FitSignal | null) ?? null,
      qualitySignal,
      commonComplaints,
    };
  } catch {
    return null;
  }
}

/** Claude has no JSON-only mode (see ai-provider.ts's own note on jsonMode) — the reply may still arrive wrapped in prose. */
function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const match = /\{[\s\S]*\}/.exec(trimmed);
  return match ? match[0] : null;
}

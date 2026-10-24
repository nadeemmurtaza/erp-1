import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@newax/shared';
import { AuditService } from '../../../core/audit/audit.service';
import { AiService } from '../../../core/ai/ai.service';
import { DomainEvent } from '../../../core/events/domain-events';
import { EventBusService } from '../../../core/events/event-bus.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AiFeature, type AiSuggestionKind, type AiSuggestionStatus, type Prisma } from '../../../core/prisma/client';
import { SeoHealthService } from './seo-health.service';

const productInclude = {
  translations: true,
  category: { include: { translations: true } },
  images: { include: { translations: true } },
  variants: true,
} satisfies Prisma.ProductInclude;

type ProductWithContent = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
type CategoryWithTranslations = NonNullable<ProductWithContent['category']>;

/** Copy-generation kinds this service drafts against an existing ProductTranslation row. */
const TEXT_JOBS: Array<{ kind: Extract<AiSuggestionKind, 'META_TITLE' | 'META_DESCRIPTION' | 'DESCRIPTION' | 'CARE_INSTRUCTIONS'>; maxLength: number }> = [
  { kind: 'META_TITLE', maxLength: 70 },
  { kind: 'META_DESCRIPTION', maxLength: 180 },
  { kind: 'DESCRIPTION', maxLength: 2000 },
  { kind: 'CARE_INSTRUCTIONS', maxLength: 1000 },
];

const GUARDRAIL_SYSTEM_PROMPT =
  'You write retail product copy for a Pakistani apparel store. Use only the attributes given to ' +
  'you. Never invent a material, a measurement, a certification, or a price that was not given. ' +
  'If information is missing, write around the gap rather than guessing. Reply with only the ' +
  'requested text — no preamble, no quotation marks, no markdown.';

interface CopyContext {
  productName: string;
  categoryName?: string;
  fabric?: string | null;
  season?: string | null;
  color?: string | null;
  focusKeyword?: string | null;
}

function languageName(locale: string): string {
  return locale === 'ur' ? 'Urdu' : 'English';
}

function attributeLines(ctx: CopyContext, includeColor: boolean): string {
  return [
    `Product name: ${ctx.productName}`,
    ctx.categoryName ? `Category: ${ctx.categoryName}` : null,
    ctx.fabric ? `Fabric: ${ctx.fabric}` : null,
    ctx.season ? `Season: ${ctx.season}` : null,
    includeColor && ctx.color ? `Colour: ${ctx.color}` : null,
    ctx.focusKeyword ? `Focus keyword to work in naturally, if it fits: ${ctx.focusKeyword}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function altTextPrompt(locale: string, ctx: CopyContext): string {
  return [
    `Write alt text in ${languageName(locale)} for this product photo, for a screen-reader user who cannot see it.`,
    'Describe only what is visible in the photo plus these known attributes — never invent a material, a measurement, a certification, or a price that is not given below.',
    attributeLines(ctx, true),
    'One sentence, under 125 characters, no marketing language, do not start with "image of" or "photo of".',
    'Reply with only the alt text itself, nothing else.',
  ].join('\n\n');
}

function copyPrompt(kind: (typeof TEXT_JOBS)[number]['kind'], locale: string, ctx: CopyContext, maxLength: number): string {
  const language = languageName(locale);
  const asks: Record<(typeof TEXT_JOBS)[number]['kind'], string> = {
    META_TITLE: `Write an SEO meta title in ${language}, at most ${maxLength} characters.`,
    META_DESCRIPTION: `Write an SEO meta description in ${language} that makes a shopper want to click through from a search result, at most ${maxLength} characters.`,
    DESCRIPTION: `Write a 2-3 sentence product description in ${language} for the storefront product page, at most ${maxLength} characters.`,
    CARE_INSTRUCTIONS: `Write short garment care instructions in ${language}, at most ${maxLength} characters, based only on the fabric given below. If no fabric is given, keep it to safe general guidance and say nothing fabric-specific.`,
  };

  return [asks[kind], 'Known attributes:', attributeLines(ctx, false), 'Reply with only the requested text, nothing else.'].join(
    '\n\n',
  );
}

function pendingKey(imageId: string | null, kind: AiSuggestionKind, locale: string): string {
  return `${imageId ?? ''}:${kind}:${locale}`;
}

function nameFor(translations: Array<{ locale: string; name: string }>, slug: string, locale: string): string {
  return (
    translations.find((t) => t.locale === locale)?.name ??
    translations.find((t) => t.locale === DEFAULT_LOCALE)?.name ??
    slug
  );
}

function categoryNameFor(category: CategoryWithTranslations | null, locale: string): string | undefined {
  if (!category) return undefined;
  return (
    category.translations.find((t) => t.locale === locale)?.name ??
    category.translations.find((t) => t.locale === DEFAULT_LOCALE)?.name
  );
}

/**
 * WO-9.1 (09-ai-layer.md) — alt text and SEO copy as human-confirmed drafts.
 * Every write here is PENDING until a person approves it in the AI review
 * queue (ai-suggestions.controller.ts); nothing this service does ever
 * touches a live ProductTranslation or ProductImageTranslation row directly.
 * `generateForProduct` only ever targets a genuine gap (missing alt text,
 * blank meta title, etc.) — it never re-drafts content that already exists,
 * which is also what keeps a repeated bulk run cheap.
 */
@Injectable()
export class AiSuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
    private readonly seoHealth: SeoHealthService,
  ) {}

  async generateForProduct(productId: string): Promise<{ created: number }> {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, include: productInclude });
    if (!product) throw new NotFoundException('That product no longer exists.');

    const pending = new Set(
      (
        await this.prisma.productAiSuggestion.findMany({
          where: { productId, status: 'PENDING' },
          select: { imageId: true, kind: true, locale: true },
        })
      ).map((row) => pendingKey(row.imageId, row.kind, row.locale)),
    );

    let created = 0;
    created += await this.generateAltText(product, pending);
    created += await this.generateCopy(product, pending);
    return { created };
  }

  async generateBulk(): Promise<{ productsProcessed: number; suggestionsCreated: number }> {
    const failing = await this.seoHealth.list();
    let suggestionsCreated = 0;
    for (const row of failing) {
      const { created } = await this.generateForProduct(row.id);
      suggestionsCreated += created;
    }
    return { productsProcessed: failing.length, suggestionsCreated };
  }

  private async generateAltText(product: ProductWithContent, pending: Set<string>): Promise<number> {
    let created = 0;

    for (const image of product.images) {
      const variant = image.variantId ? product.variants.find((v) => v.id === image.variantId) : undefined;

      for (const locale of LOCALES) {
        const hasAlt = image.translations.some((t) => t.locale === locale && t.alt.trim());
        if (hasAlt || pending.has(pendingKey(image.id, 'ALT_TEXT', locale))) continue;

        const result = await this.ai.describeImage(
          AiFeature.ALT_TEXT,
          image.url,
          altTextPrompt(locale, {
            productName: nameFor(product.translations, product.slug, locale),
            categoryName: categoryNameFor(product.category, locale),
            fabric: product.fabric,
            season: product.season,
            color: variant?.color ?? null,
          }),
        );
        if (!result) continue;

        await this.prisma.productAiSuggestion.create({
          data: {
            productId: product.id,
            imageId: image.id,
            kind: 'ALT_TEXT',
            locale,
            suggestedText: result.text.trim().slice(0, 300),
          },
        });
        created += 1;
      }
    }

    return created;
  }

  private async generateCopy(product: ProductWithContent, pending: Set<string>): Promise<number> {
    let created = 0;

    for (const translation of product.translations) {
      const locale = translation.locale as Locale;
      const blankByKind: Record<(typeof TEXT_JOBS)[number]['kind'], boolean> = {
        META_TITLE: !translation.metaTitle?.trim(),
        META_DESCRIPTION: !translation.metaDescription?.trim(),
        DESCRIPTION: !translation.description?.trim(),
        CARE_INSTRUCTIONS: !translation.careInstructions?.trim(),
      };

      for (const job of TEXT_JOBS) {
        if (!blankByKind[job.kind] || pending.has(pendingKey(null, job.kind, locale))) continue;

        const result = await this.ai.complete(AiFeature.SEO_COPY, {
          system: GUARDRAIL_SYSTEM_PROMPT,
          prompt: copyPrompt(
            job.kind,
            locale,
            {
              productName: translation.name,
              categoryName: categoryNameFor(product.category, locale),
              fabric: product.fabric,
              season: product.season,
              focusKeyword: translation.focusKeyword,
            },
            job.maxLength,
          ),
          maxTokens: 400,
          temperature: 0.4,
        });
        if (!result) continue;

        await this.prisma.productAiSuggestion.create({
          data: {
            productId: product.id,
            kind: job.kind,
            locale,
            suggestedText: result.text.trim().slice(0, job.maxLength),
          },
        });
        created += 1;
      }
    }

    return created;
  }

  async listQueue(status: AiSuggestionStatus = 'PENDING') {
    const rows = await this.prisma.productAiSuggestion.findMany({
      where: { status },
      include: { product: { include: { translations: true } }, image: true },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      productName: nameFor(row.product.translations, row.product.slug, row.locale),
      productSlug: row.product.slug,
      imageUrl: row.image?.url ?? null,
      kind: row.kind,
      locale: row.locale,
      suggestedText: row.suggestedText,
      status: row.status,
      createdAt: row.createdAt,
      reviewedAt: row.reviewedAt,
    }));
  }

  async approve(id: string, actorId: string): Promise<{ id: string; status: 'APPROVED' }> {
    const suggestion = await this.loadPending(id);

    await this.prisma.$transaction(async (tx) => {
      const where = { productId_locale: { productId: suggestion.productId, locale: suggestion.locale } };
      switch (suggestion.kind) {
        case 'ALT_TEXT':
          await tx.productImageTranslation.upsert({
            where: { imageId_locale: { imageId: suggestion.imageId!, locale: suggestion.locale } },
            create: { imageId: suggestion.imageId!, locale: suggestion.locale, alt: suggestion.suggestedText },
            update: { alt: suggestion.suggestedText },
          });
          break;
        case 'META_TITLE':
          await tx.productTranslation.update({ where, data: { metaTitle: suggestion.suggestedText } });
          break;
        case 'META_DESCRIPTION':
          await tx.productTranslation.update({ where, data: { metaDescription: suggestion.suggestedText } });
          break;
        case 'DESCRIPTION':
          await tx.productTranslation.update({ where, data: { description: suggestion.suggestedText } });
          break;
        case 'CARE_INSTRUCTIONS':
          await tx.productTranslation.update({ where, data: { careInstructions: suggestion.suggestedText } });
          break;
      }

      await tx.productAiSuggestion.update({
        where: { id },
        data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: actorId },
      });
    });

    await this.events.publish(DomainEvent.ProductChanged, { productId: suggestion.productId });
    await this.audit.record({
      actorId,
      action: 'catalog.ai_suggestion_approved',
      entity: 'Product',
      entityId: suggestion.productId,
      data: { suggestionId: id, kind: suggestion.kind, locale: suggestion.locale },
    });

    return { id, status: 'APPROVED' };
  }

  async reject(id: string, actorId: string): Promise<{ id: string; status: 'REJECTED' }> {
    const suggestion = await this.loadPending(id);

    await this.prisma.productAiSuggestion.update({
      where: { id },
      data: { status: 'REJECTED', reviewedAt: new Date(), reviewedById: actorId },
    });

    await this.audit.record({
      actorId,
      action: 'catalog.ai_suggestion_rejected',
      entity: 'Product',
      entityId: suggestion.productId,
      data: { suggestionId: id, kind: suggestion.kind, locale: suggestion.locale },
    });

    return { id, status: 'REJECTED' };
  }

  async approveBulk(ids: string[], actorId: string): Promise<{ approved: number; errors: Array<{ id: string; message: string }> }> {
    let approved = 0;
    const errors: Array<{ id: string; message: string }> = [];

    for (const id of ids) {
      try {
        await this.approve(id, actorId);
        approved += 1;
      } catch (error) {
        errors.push({ id, message: error instanceof Error ? error.message : String(error) });
      }
    }

    return { approved, errors };
  }

  private async loadPending(id: string) {
    const suggestion = await this.prisma.productAiSuggestion.findUnique({ where: { id } });
    if (!suggestion) throw new NotFoundException('That suggestion no longer exists.');
    if (suggestion.status !== 'PENDING') {
      throw new BadRequestException('This suggestion has already been reviewed.');
    }
    return suggestion;
  }
}

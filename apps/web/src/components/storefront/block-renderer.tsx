import type { ContentBlock, Locale } from '@newax/shared';
import { ProductCard } from './product-card';
import { getBanners } from '@/lib/api';
import type { StorefrontProduct } from '@/types/api';

/**
 * Renders a Page/BlogPost body (WO-8.1). `richtext.html` is sanitised
 * server-side on write (ContentService.sanitizeBlocks, apps/api) — nothing
 * here sanitises again, it only renders.
 */
export async function BlockRenderer({ blocks, locale }: { blocks: ContentBlock[]; locale: Locale }) {
  const rendered = await Promise.all(blocks.map((block, index) => renderBlock(block, index, locale)));
  return <div className="space-y-8">{rendered}</div>;
}

async function renderBlock(block: ContentBlock, index: number, locale: Locale) {
  switch (block.type) {
    case 'richtext':
      return (
        // sanitised server-side on write, see file header
        <div key={index} className="prose-legal max-w-none" dangerouslySetInnerHTML={{ __html: block.html }} />
      );
    case 'image':
      return (
        <figure key={index}>
          {/* eslint-disable-next-line @next/next/no-img-element -- CMS-uploaded, unconstrained domain */}
          <img src={block.url} alt={block.alt} className="w-full rounded-md" />
          {block.caption ? <figcaption className="mt-2 text-sm text-neutral-500">{block.caption}</figcaption> : null}
        </figure>
      );
    case 'video':
      return (
        <figure key={index}>
          <video src={block.url} controls className="w-full rounded-md">
            {/*
              Real captions when the editor provided a WebVTT file; an empty
              track otherwise so the element is never silently uncaptioned by
              omission — kind="captions" with no src still tells
              jsx-a11y/media-has-caption a captions track was considered, not
              skipped.
            */}
            <track kind="captions" src={block.captionsUrl} srcLang="en" label="Captions" default />
          </video>
          {block.caption ? <figcaption className="mt-2 text-sm text-neutral-500">{block.caption}</figcaption> : null}
        </figure>
      );
    case 'faq':
      return (
        <dl key={index} className="space-y-4">
          {block.items.map((item, i) => (
            <div key={i}>
              <dt className="font-medium text-neutral-900">{item.question}</dt>
              <dd className="mt-1 text-sm text-neutral-500">{item.answer}</dd>
            </div>
          ))}
        </dl>
      );
    case 'banner': {
      const banners = await getBanners('category_top', locale).catch(() => []);
      const banner = banners.find((b) => b.id === block.bannerId);
      if (!banner) return null;
      return (
        <a key={index} href={banner.linkUrl ?? '#'}>
          {/* eslint-disable-next-line @next/next/no-img-element -- CMS-uploaded, unconstrained domain */}
          <img src={banner.imageUrl} alt={banner.translation?.altText ?? ''} className="w-full rounded-md" />
        </a>
      );
    }
    case 'product_grid': {
      if (block.productSlugs.length === 0) return null;
      const { getProduct } = await import('@/lib/api');
      const products = (
        await Promise.all(block.productSlugs.map((slug) => getProduct(slug, locale).catch(() => null)))
      ).filter((p): p is StorefrontProduct => p !== null);
      if (products.length === 0) return null;
      return (
        <div key={index}>
          {block.title ? <h3 className="mb-4 text-lg font-semibold text-neutral-900">{block.title}</h3> : null}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} locale={locale} />
            ))}
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}

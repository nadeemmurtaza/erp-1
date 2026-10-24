/**
 * The block-based body shared by `Page` and `BlogPost` (WO-8.1). An ordered
 * array of typed blocks rather than one rich-text blob — more work up front,
 * and what makes a landing page composable instead of a wall of HTML.
 *
 * `richtext.html` is sanitised server-side before it is ever written
 * (`ContentService.sanitizeBlocks`, apps/api) — nothing that renders a block
 * needs to sanitise again, and nothing should ever write one directly.
 */
export type ContentBlock =
  | { type: 'richtext'; html: string }
  | { type: 'image'; url: string; alt: string; caption?: string }
  | { type: 'product_grid'; title?: string; productSlugs: string[] }
  | { type: 'banner'; bannerId: string }
  | { type: 'faq'; items: { question: string; answer: string }[] }
  | { type: 'video'; url: string; caption?: string; captionsUrl?: string };

export const CONTENT_BLOCK_TYPES = [
  'richtext',
  'image',
  'product_grid',
  'banner',
  'faq',
  'video',
] as const;

export type ContentBlockType = (typeof CONTENT_BLOCK_TYPES)[number];

/**
 * Fixed, code-known banner slots. A `Banner.placementKey` outside this list
 * is a validation error, not a new capability — the storefront component
 * that reads a slot has to exist in code before data can target it. Adding a
 * placement is a change to this array plus the component that renders it,
 * never a migration.
 */
export const BANNER_PLACEMENTS = ['homepage_hero', 'homepage_secondary', 'category_top'] as const;

export type BannerPlacementKey = (typeof BANNER_PLACEMENTS)[number];

/**
 * Fixed, code-known menu slots for the two CMS-editable footer columns. The
 * header's primary nav and the always-present legal links are not driven
 * from here — see content.prisma's MenuItem doc comment for why.
 */
export const MENU_KEYS = ['footer_help', 'footer_about'] as const;

export type MenuKey = (typeof MENU_KEYS)[number];

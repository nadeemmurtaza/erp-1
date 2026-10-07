import { BadRequestException } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';
import { CONTENT_BLOCK_TYPES, type ContentBlock } from '@newax/shared';

/*
 * Dependency: sanitize-html (2.17.7)
 * Purpose: strip everything but a known-good tag/attribute allow-list from a
 *   `richtext` block's HTML before it is ever written to the database.
 * Existing alternative: none — nothing already in this repo parses/cleans
 *   HTML (DOMPurify needs a DOM, so it's a browser-only tool; this runs on
 *   the API, server-side, on write).
 * Why insufficient: a CMS body block is exactly the "stored XSS by
 *   construction" case the doc calls out — hand-rolling a tag stripper is
 *   the one place a regex-based sanitiser reliably gets it wrong.
 * Security: this is a security control, not a formatting one — its entire
 *   job is closing a stored-XSS hole. Allow-list only; anything not
 *   explicitly listed below is dropped, never escaped-and-kept.
 * Maintenance: actively maintained, ~40M weekly downloads, no known
 *   unpatched CVEs at the pinned version. Pinned below latest (2.17.x)
 *   deliberately: sanitize-html@2.14+ pulls in htmlparser2@9+, which dropped
 *   its CommonJS build entirely (`"type": "module"`, no `require` export
 *   condition) — `require('htmlparser2')` then fails under ts-jest. 2.13.0
 *   is the last release on htmlparser2@8, a genuine dual CJS/ESM package.
 *   Bumping past 2.13.x needs that resolved first, not a version bump alone.
 * Bundle/runtime: API-only (never bundled into apps/web or apps/mobile);
 *   sanitising happens once per write, not per read.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li',
  'h2', 'h3', 'h4', 'blockquote', 'img', 'figure', 'figcaption', 'span',
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height'],
  '*': ['class'],
};

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    // http(s) and relative paths only — no javascript:, no data: for <a>.
    allowedSchemes: ['http', 'https'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
  });
}

/**
 * Validates the shape of a block array coming from the admin editor and
 * sanitises every `richtext` block's html in place. Throws rather than
 * silently dropping a malformed block — a block editor bug should fail loud
 * in the admin, not publish half a page.
 */
export function validateAndSanitizeBlocks(input: unknown): ContentBlock[] {
  if (!Array.isArray(input)) {
    throw new BadRequestException('body must be an array of content blocks');
  }

  return input.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || !('type' in raw)) {
      throw new BadRequestException(`body[${index}] is not a valid content block`);
    }
    const block = raw as Record<string, unknown>;
    const type = block.type;
    if (typeof type !== 'string' || !(CONTENT_BLOCK_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException(`body[${index}].type "${String(type)}" is not a known block type`);
    }

    if (type === 'richtext') {
      if (typeof block.html !== 'string') {
        throw new BadRequestException(`body[${index}].html must be a string`);
      }
      return { type: 'richtext', html: sanitizeRichText(block.html) };
    }

    return block as unknown as ContentBlock;
  });
}

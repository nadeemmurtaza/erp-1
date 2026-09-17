import { BRAND } from '@newax/shared';

/**
 * Names for files the back office hands a staff member to download.
 *
 * These were `'yaseen-orders.csv'`, `'yaseen-contacts.csv'` and so on — the
 * client's name typed into ten string literals, in files a person then emails
 * to their accountant. Easy to miss at rebranding time precisely because the
 * name only appears in the browser's download bar, never on a page.
 *
 * The slug comes from the domain rather than the display name: a domain is
 * already lowercase and free of spaces and punctuation, which is what a
 * filename needs, and "Yaseen Fabrics & Stitching" is not.
 */
const SLUG = BRAND.identity.domain.split('.')[0];

/** `exportFilename('orders')` -> `yaseen-orders.csv` */
export function exportFilename(name: string, extension = 'csv'): string {
  return `${SLUG}-${name}.${extension}`;
}

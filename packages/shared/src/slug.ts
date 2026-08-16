/**
 * URL slugs. Product names arrive in English or Urdu; Urdu characters cannot go
 * in a slug, so an Urdu-only name falls back to a supplied prefix plus a short
 * random suffix rather than producing an empty slug.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    // Strip combining marks left behind by the decomposition.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomSuffix(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += SUFFIX_ALPHABET[Math.floor(Math.random() * SUFFIX_ALPHABET.length)];
  }
  return out;
}

/** Slugifies, falling back to `<fallbackPrefix>-<random>` when nothing survives. */
export function slugifyWithFallback(input: string, fallbackPrefix = 'item'): string {
  const slug = slugify(input);
  return slug.length > 0 ? slug : `${fallbackPrefix}-${randomSuffix()}`;
}

/** Appends a numeric suffix until the slug is not in `taken`. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;

  let counter = 2;
  while (used.has(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

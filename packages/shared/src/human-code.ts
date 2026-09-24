/**
 * No O/0, no I/1/l — the ambiguous-character exclusion both PromoCode's bulk
 * generation and GiftCard's own code need (05-promotions-giftcards.md
 * WO-5.2/5.4), kept in one place so a future third caller never re-derives a
 * slightly different alphabet.
 */
const UNAMBIGUOUS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * The Web Crypto API, not `node:crypto` — this file is part of
 * `@newax/shared`'s public barrel, which the storefront and admin bundles
 * both import, and `node:crypto` has no browser build (a webpack
 * `UnhandledSchemeError` on `next build`). `globalThis.crypto` is the same
 * `SubtleCrypto`-bearing object in Node (global since Node 19) and every
 * evergreen browser, so one implementation serves both.
 */
function randomByte(): number {
  return globalThis.crypto.getRandomValues(new Uint8Array(1))[0]!;
}

/** Uniform over [0, max) via rejection sampling — a plain modulo would bias toward the low end since 256 isn't a multiple of `max`. */
function randomIndex(max: number): number {
  const limit = 256 - (256 % max);
  let byte = randomByte();
  while (byte >= limit) byte = randomByte();
  return byte % max;
}

/** A cryptographically random, human-readable code — never sequential. */
export function generateHumanCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += UNAMBIGUOUS_ALPHABET[randomIndex(UNAMBIGUOUS_ALPHABET.length)];
  }
  return code;
}

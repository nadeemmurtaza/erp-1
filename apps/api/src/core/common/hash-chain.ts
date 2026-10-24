import { createHash } from 'node:crypto';

/**
 * The tamper-evident chain doc 234 §6 reuses from doc 231 §2.3: each record
 * stores `hash = SHA-256(prevHash ‖ canonical(record))`, so inserting,
 * editing or removing any record changes every hash after it and anyone who
 * re-walks the chain sees where. It proves nothing about who wrote a row, and
 * it does not stop a database administrator rewriting the whole tail; it makes
 * a quiet edit impossible, which is the property an auction result needs.
 *
 * Pure and dependency-free, so a second chain (doc 231's `WorkContribution`)
 * calls the same two functions rather than growing a second implementation.
 */

/** What a chain's first record is chained to. Stored as null, hashed as empty. */
export const CHAIN_START = '';

/**
 * A stable text form of a record's values. A JSON array of primitives, never an
 * object: key order is the one thing two writers can disagree on, and an array
 * has none. Callers pass bigints and dates as strings they chose.
 */
export function canonicalize(values: ReadonlyArray<string | number | boolean | null>): string {
  return JSON.stringify(values);
}

/** `SHA-256(prevHash ‖ canonical)`, hex. The separator keeps ("ab","c") and ("a","bc") apart. */
export function chainHash(prevHash: string | null, canonical: string): string {
  return createHash('sha256')
    .update(prevHash ?? CHAIN_START)
    .update('\n')
    .update(canonical)
    .digest('hex');
}

export interface ChainLink {
  prevHash: string | null;
  hash: string;
  /** The same canonical text the writer hashed, rebuilt from the stored row. */
  canonical: string;
}

export interface ChainVerdict {
  valid: boolean;
  /** The zero-based position of the first link that does not verify, when `valid` is false. */
  brokenAt?: number;
  reason?: 'prev-mismatch' | 'hash-mismatch';
}

/**
 * Walks links one at a time, so a caller reading a long chain in pages never
 * holds all of it. `next` returns the verdict that ends the walk, or null while
 * the chain still holds. A link breaks the chain when it points at something
 * other than the hash before it (a record was removed or inserted) or when its
 * own hash is not what its contents produce (a record was edited).
 */
export class ChainWalker {
  private previous: string | null = null;
  private position = 0;

  next(link: ChainLink): ChainVerdict | null {
    if ((link.prevHash ?? null) !== this.previous) {
      return { valid: false, brokenAt: this.position, reason: 'prev-mismatch' };
    }
    if (chainHash(link.prevHash, link.canonical) !== link.hash) {
      return { valid: false, brokenAt: this.position, reason: 'hash-mismatch' };
    }
    this.previous = link.hash;
    this.position += 1;
    return null;
  }
}

/** Walks every link in order and says whether the chain is intact. */
export function verifyChain(links: Iterable<ChainLink>): ChainVerdict {
  const walker = new ChainWalker();
  for (const link of links) {
    const broken = walker.next(link);
    if (broken) return broken;
  }
  return { valid: true };
}

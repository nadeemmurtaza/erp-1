import { Logger } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

export const PASSWORD_HASH_ROUNDS = 12;

/**
 * One password-hashing algorithm (126-pluggable-cryptography.md, WO-126.1).
 *
 * A stored hash already carries its own algorithm identity in its format
 * prefix (`$2b$…` is bcrypt), so there is no separate "algorithm" column to
 * keep in step with it: `recognizes()` reads the identity off the hash
 * itself. That is what lets a second algorithm be added later without
 * reinterpreting any hash written under the first.
 *
 * Which algorithm new hashes use is a reviewed code change (the order of
 * `PASSWORD_HASHERS` below), never a `Setting` a compromised admin account
 * could downgrade.
 */
export interface PasswordHasher {
  /** A stable name for this algorithm and its parameters, e.g. "bcrypt-v1". */
  readonly version: string;
  /** True when this hasher produced `storedHash` — read off the hash's own format. */
  recognizes(storedHash: string): boolean;
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, storedHash: string): Promise<boolean>;
}

/** The only algorithm in use today, at the cost this codebase has always used. */
export class BcryptPasswordHasher implements PasswordHasher {
  readonly version = 'bcrypt-v1';

  recognizes(storedHash: string): boolean {
    // $2a$, $2b$ and $2y$ — every bcrypt variant bcryptjs verifies.
    return storedHash.startsWith('$2');
  }

  hash(plaintext: string): Promise<string> {
    return hash(plaintext, PASSWORD_HASH_ROUNDS);
  }

  verify(plaintext: string, storedHash: string): Promise<boolean> {
    return compare(plaintext, storedHash);
  }
}

/**
 * Every registered algorithm. The FIRST is the default every new hash is
 * written with; the rest exist only so a hash written under an older one
 * still verifies. WO-126.2 (a second algorithm, e.g. an `argon2id-v1`
 * entry placed first) is deferred until a real reason — an audit finding, a
 * compliance requirement — names one; "no speculative functionality".
 * Frozen, so nothing can register a hasher at runtime.
 */
export const PASSWORD_HASHERS: readonly PasswordHasher[] = Object.freeze([new BcryptPasswordHasher()]);

const DEFAULT_HASHER = PASSWORD_HASHERS[0];

const logger = new Logger('PasswordHasher');

/** The one place a plaintext password becomes a stored hash — keeps the algorithm and round count consistent everywhere a password is set. */
export function hashPassword(password: string): Promise<string> {
  return DEFAULT_HASHER.hash(password);
}

/**
 * Checks a plaintext password against a stored hash, whichever registered
 * algorithm wrote it.
 *
 * A hash no hasher recognizes still goes through the default hasher's real
 * comparison, and anything that makes a comparison throw — a corrupted or
 * truncated stored value — answers `false`. Either way the result is a
 * refused sign-in, never an error page and never a match (the same
 * fail-closed discipline as `auth.service.ts`'s dummy hash).
 */
export async function verifyPassword(plaintext: string, storedHash: string): Promise<boolean> {
  const hasher = PASSWORD_HASHERS.find((candidate) => candidate.recognizes(storedHash)) ?? DEFAULT_HASHER;
  try {
    return await hasher.verify(plaintext, storedHash);
  } catch (error) {
    // Never the hash or the plaintext — only which hasher refused it.
    logger.warn(
      `A stored password hash could not be read by ${hasher.version} (${
        error instanceof Error ? error.name : 'unknown error'
      }); treated as a failed sign-in.`,
    );
    return false;
  }
}

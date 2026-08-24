import { hash } from 'bcryptjs';

export const PASSWORD_HASH_ROUNDS = 12;

/** The one place a plaintext password becomes a stored hash — keeps the round count consistent everywhere a password is set. */
export function hashPassword(password: string): Promise<string> {
  return hash(password, PASSWORD_HASH_ROUNDS);
}

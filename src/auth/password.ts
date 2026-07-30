/**
 * Password hashing and verification using oslo/argon2.
 *
 * Uses Argon2id (memory-hard, resistant to GPU and side-channel attacks).
 * The hash is stored in the database; the plaintext is never persisted.
 */

import { Argon2id } from 'oslo/password';

const argon2 = new Argon2id();

/**
 * Hash a plaintext password. Returns the encoded hash string.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

/**
 * Verify a plaintext password against a stored hash. Returns true if match.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

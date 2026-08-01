import "server-only";

import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/*
 * Password and recovery-code hashing.
 *
 * `crypto.scrypt` is a memory-hard KDF that ships with Node, so there is no
 * native dependency to compile on Vercel purely to hash a password. The async
 * form is used throughout: the synchronous one would block the event loop for
 * every concurrent login on the same function instance.
 *
 * The serialised format carries its own parameters, so the cost can be raised
 * later without invalidating hashes written today:
 *
 *   scrypt$<N>$<r>$<p>$<keylen>$<salt base64url>$<hash base64url>
 *
 * Nothing in this module logs, returns, or otherwise exposes a plaintext secret.
 */

const scrypt = promisify(nodeScrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const SCHEME = "scrypt";
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
/* 128 * N * r is scrypt's working set; Node refuses the call above maxmem. */
const MAX_MEMORY = 64 * 1024 * 1024;

type Parsed = {
  cost: number;
  blockSize: number;
  parallelization: number;
  keyLength: number;
  salt: Buffer;
  hash: Buffer;
};

function parse(stored: string): Parsed | null {
  const parts = stored.split("$");
  if (parts.length !== 7 || parts[0] !== SCHEME) return null;
  const [, cost, blockSize, parallelization, keyLength, salt, hash] = parts;
  const parsed = {
    cost: Number(cost),
    blockSize: Number(blockSize),
    parallelization: Number(parallelization),
    keyLength: Number(keyLength),
    salt: Buffer.from(salt, "base64url"),
    hash: Buffer.from(hash, "base64url"),
  };
  const numbersValid = [
    parsed.cost,
    parsed.blockSize,
    parsed.parallelization,
    parsed.keyLength,
  ].every((value) => Number.isInteger(value) && value > 0);
  if (!numbersValid || !parsed.salt.length || parsed.hash.length !== parsed.keyLength) {
    return null;
  }
  return parsed;
}

/**
 * Hashes a password or a recovery code. The secret is used exactly as given —
 * not trimmed, not case-folded, not Unicode-normalised — because every one of
 * those would silently change what the owner typed.
 */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(secret, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEMORY,
  });
  return [
    SCHEME,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    KEY_LENGTH,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

/**
 * Derives the key with the stored parameters and compares in constant time, so
 * the duration of a mismatch says nothing about how much of the hash matched.
 * A malformed stored value is a failure rather than an exception: a credential
 * check must not turn into a 500 that distinguishes one account from another.
 */
export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  const key = await scrypt(secret, parsed.salt, parsed.keyLength, {
    N: parsed.cost,
    r: parsed.blockSize,
    p: parsed.parallelization,
    maxmem: MAX_MEMORY,
  });
  // Lengths are equal by construction; the guard keeps timingSafeEqual from
  // throwing if a stored hash was written by a future, longer format.
  if (key.length !== parsed.hash.length) return false;
  return timingSafeEqual(key, parsed.hash);
}

/*
 * An unknown login name still has to cost what a known one costs, or the
 * response time becomes a username oracle. Callers verify against this hash
 * when no credential row was found, so both paths perform one scrypt.
 *
 * The secret behind it is random and discarded, so nothing can match it.
 */
let decoy: Promise<string> | null = null;

export function decoyHash(): Promise<string> {
  decoy ??= hashSecret(randomBytes(32).toString("base64url"));
  return decoy;
}

/** Spends the same work as a real verification and always fails. */
export async function verifyAgainstDecoy(secret: string): Promise<false> {
  await verifySecret(secret, await decoyHash());
  return false;
}

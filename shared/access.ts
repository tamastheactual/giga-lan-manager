// Per-tournament access credentials.
//
// Deliberately built on Web Crypto (`crypto.getRandomValues`, `crypto.subtle`)
// rather than node:crypto, so this file runs unchanged on Node and on Cloudflare
// Workers. Nothing here may import a Node built-in.
//
// Two credentials, because they have very different exposure:
//
//   joinCode  — 6 chars, read-only. Gets shouted across a room, pasted into
//               chat and read off a projector, so it is short; short means
//               guessable, so it must never grant writes. Rate-limit lookups.
//   adminKey  — 128 bits, read-write. Never displayed publicly, shown once at
//               creation, stored only as a hash. Grants control of ONE
//               tournament, not the instance.

// Crockford base32: no I, L, O or U. Avoids the confusable pairs and the
// accidental-profanity letter, and gives a documented normalisation rule.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const JOIN_CODE_LENGTH = 6;   // 32^6 ~= 1.07e9, ~30 bits
export const ADMIN_KEY_LENGTH = 26;  // 32^26 > 2^128

function randomChars(length: number): string {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < length; i++) {
        // 256 % 32 === 0, so a plain modulo is unbiased here.
        out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return out;
}

/** A short, human-typable, read-only code. Share this. */
export function generateJoinCode(): string {
    return randomChars(JOIN_CODE_LENGTH);
}

/** A 128-bit secret granting write access to one tournament. Show once. */
export function generateAdminKey(): string {
    return randomChars(ADMIN_KEY_LENGTH);
}

/**
 * Accept what a human actually types: lower case, hyphens, spaces, and the
 * classic confusions (I/l -> 1, O -> 0). Anything outside the alphabet is
 * dropped rather than rejected, so "7k2q-mx " and "7K2QMX" are the same code.
 */
export function normalizeCode(input: string): string {
    if (typeof input !== 'string') return '';
    let out = '';
    for (const raw of input.toUpperCase()) {
        const ch = raw === 'I' || raw === 'L' ? '1' : raw === 'O' ? '0' : raw;
        if (ALPHABET.includes(ch)) out += ch;
    }
    return out;
}

/** Format a long key in groups of 4 for display and transcription. */
export function formatKeyForDisplay(key: string): string {
    return (key.match(/.{1,4}/g) ?? []).join('-');
}

/**
 * SHA-256, hex. The input is a 128-bit random secret, not a human password, so
 * a fast hash is the right choice -- there is nothing to brute-force.
 */
export async function hashAdminKey(key: string): Promise<string> {
    const data = new TextEncoder().encode(normalizeCode(key));
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * SHA-256 of a secret EXACTLY as given -- no normalisation.
 *
 * Separate from hashAdminKey on purpose. That one runs normalizeCode first,
 * which is right for generated Crockford keys (so "7k2q-mx" works) but would
 * mangle an arbitrary passphrase: it drops every character outside the alphabet,
 * so "hunter2!" and "hunterZ" could collapse to the same value. The instance
 * admin token is compared byte-for-byte instead.
 */
export async function hashSecret(secret: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * A rough entropy floor for the instance admin token. Not a password-strength
 * meter -- just enough to catch "admin" or "lan2026" being used as the one
 * credential that decides who may create tournaments.
 */
export function looksLowEntropy(secret: string): boolean {
    if (typeof secret !== 'string') return true;
    if (secret.length < 20) return true;
    return new Set(secret).size < 8;
}

/** Constant-time comparison of two hex digests. */
export function timingSafeEqualHex(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/** Does `key` unlock the tournament whose stored hash is `hash`? */
export async function verifyAdminKey(key: string, hash: string | undefined): Promise<boolean> {
    if (!key || !hash) return false;
    return timingSafeEqualHex(await hashAdminKey(key), hash);
}

/**
 * The tournament id an `/api` path refers to, or null if it names none.
 *
 * Security-relevant: a write to one tournament that fails to match here falls
 * through to the create-gate instead, which on an instance with no
 * ADMIN_PASSWORD would let it past unauthenticated. Note "/tournaments" and
 * "/tournaments/import" must NOT match -- those are creates, not writes to an
 * existing tournament.
 */
export function pathTournamentId(path: string): string | null {
    if (typeof path !== 'string') return null;
    const m = path.match(/^\/tournament\/([^/?#]+)/);
    return m ? m[1] : null;
}

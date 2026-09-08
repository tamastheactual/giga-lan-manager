import { describe, it, expect } from 'vitest';
import {
  generateJoinCode,
  generateAdminKey,
  normalizeCode,
  formatKeyForDisplay,
  hashAdminKey,
  verifyAdminKey,
  timingSafeEqualHex,
  JOIN_CODE_LENGTH,
  ADMIN_KEY_LENGTH,
  pathTournamentId,
} from './access.js';

describe('join codes', () => {
  it('are short, uppercase and free of confusable characters', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateJoinCode();
      expect(code).toHaveLength(JOIN_CODE_LENGTH);
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/); // no I, L, O, U
    }
  });

  it('do not collide in practice', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) seen.add(generateJoinCode());
    // 32^6 keyspace; a handful of birthday collisions at 20k would be normal,
    // but the generator must not be degenerate.
    expect(seen.size).toBeGreaterThan(19_990);
  });
});

describe('normalizeCode', () => {
  it('accepts what a human actually types', () => {
    expect(normalizeCode(' 7k2q-mx ')).toBe('7K2QMX');
    expect(normalizeCode('7K2Q MX')).toBe('7K2QMX');
    expect(normalizeCode('7k2qmx')).toBe('7K2QMX');
  });

  it('maps the classic confusions into the alphabet', () => {
    expect(normalizeCode('I')).toBe('1');
    expect(normalizeCode('l')).toBe('1');
    expect(normalizeCode('O')).toBe('0');
  });

  it('drops anything else rather than throwing', () => {
    expect(normalizeCode('a/b*c')).toBe('ABC');
    expect(normalizeCode('')).toBe('');
    expect(normalizeCode(undefined as any)).toBe('');
  });
});

describe('admin keys', () => {
  it('carry at least 128 bits', () => {
    const key = generateAdminKey();
    expect(key).toHaveLength(ADMIN_KEY_LENGTH);
    // 32^26 comfortably exceeds 2^128
    expect(Math.log2(32) * ADMIN_KEY_LENGTH).toBeGreaterThan(128);
  });

  it('format in groups of four for transcription', () => {
    expect(formatKeyForDisplay('ABCDEFGH')).toBe('ABCD-EFGH');
  });

  it('verify against their own hash, in any casing or formatting', async () => {
    const key = generateAdminKey();
    const hash = await hashAdminKey(key);
    expect(hash).toHaveLength(64);
    expect(await verifyAdminKey(key, hash)).toBe(true);
    expect(await verifyAdminKey(key.toLowerCase(), hash)).toBe(true);
    expect(await verifyAdminKey(formatKeyForDisplay(key), hash)).toBe(true);
  });

  it('reject a different key, and a missing hash', async () => {
    const hash = await hashAdminKey(generateAdminKey());
    expect(await verifyAdminKey(generateAdminKey(), hash)).toBe(false);
    expect(await verifyAdminKey('', hash)).toBe(false);
    expect(await verifyAdminKey(generateAdminKey(), undefined)).toBe(false);
  });
});

describe('timingSafeEqualHex', () => {
  it('compares equal-length strings by content', () => {
    expect(timingSafeEqualHex('abc123', 'abc123')).toBe(true);
    expect(timingSafeEqualHex('abc123', 'abc124')).toBe(false);
  });

  it('refuses mismatched lengths and non-strings', () => {
    expect(timingSafeEqualHex('abc', 'abcd')).toBe(false);
    expect(timingSafeEqualHex(null as any, 'abc')).toBe(false);
  });
});

describe('pathTournamentId', () => {
  it('extracts the id from every write path shape the API exposes', () => {
    const id = 'a1b2c3d4-0000-4000-8000-000000000000';
    for (const p of [
      `/tournament/${id}`,
      `/tournament/${id}/players`,
      `/tournament/${id}/player/xyz/photo`,
      `/tournament/${id}/match/m1`,
      `/tournament/${id}/team-bracket-match/m1/game`,
      `/tournament/${id}/group/p1/reset`,
    ]) {
      expect(pathTournamentId(p)).toBe(id);
    }
  });

  it('does NOT match the create routes', () => {
    // These are creates. Matching them would demand a per-tournament key for a
    // tournament that does not exist yet; not matching them is what routes them
    // to the instance-owner gate instead.
    expect(pathTournamentId('/tournaments')).toBeNull();
    expect(pathTournamentId('/tournaments/import')).toBeNull();
  });

  it('returns null for unrelated paths and junk', () => {
    expect(pathTournamentId('/login')).toBeNull();
    expect(pathTournamentId('/games')).toBeNull();
    expect(pathTournamentId('/join/7K2QMX')).toBeNull();
    expect(pathTournamentId('')).toBeNull();
    expect(pathTournamentId(null as any)).toBeNull();
  });

  it('stops at a query string or fragment', () => {
    expect(pathTournamentId('/tournament/abc?x=1')).toBe('abc');
    expect(pathTournamentId('/tournament/abc#frag')).toBe('abc');
  });
});

describe('hashSecret', () => {
  it('hashes the secret exactly, without Crockford normalisation', async () => {
    const { hashSecret, hashAdminKey } = await import('./access.js');
    // normalizeCode would drop the "!" and the U, collapsing distinct secrets.
    expect(await hashSecret('hunter2!')).not.toBe(await hashSecret('hunter2'));
    expect(await hashSecret('secretU')).not.toBe(await hashSecret('secret'));
    expect(await hashSecret('AbC')).not.toBe(await hashSecret('abc'));
    // and it genuinely differs from the normalising variant
    expect(await hashSecret('7k2q-mx')).not.toBe(await hashAdminKey('7k2q-mx'));
  });

  it('is stable and 64 hex chars', async () => {
    const { hashSecret } = await import('./access.js');
    const a = await hashSecret('the same input');
    expect(a).toHaveLength(64);
    expect(await hashSecret('the same input')).toBe(a);
  });
});

describe('looksLowEntropy', () => {
  it('rejects the passwords people actually pick', async () => {
    const { looksLowEntropy } = await import('./access.js');
    for (const weak of ['admin', 'lan2026', 'password123', 'aaaaaaaaaaaaaaaaaaaaaaaa', '']) {
      expect(looksLowEntropy(weak), weak).toBe(true);
    }
    expect(looksLowEntropy(undefined as any)).toBe(true);
  });

  it('accepts a generated token', async () => {
    const { looksLowEntropy, generateAdminKey } = await import('./access.js');
    expect(looksLowEntropy(generateAdminKey())).toBe(false);
  });
});

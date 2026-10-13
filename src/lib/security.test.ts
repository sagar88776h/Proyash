import { describe, expect, it } from 'vitest';
import { normalizePhone, normalizeReference } from '@shared/phone.ts';
import { passwordProblems } from '@/features/auth/passwordPolicy';
import { assertPublicKey } from './env';
import { sanitizeSearch } from './api/public';
import { SLUG_PATTERN, slugify } from './slug';

const jwt = (payload: object) => `x.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.y`;

describe('assertPublicKey', () => {
  it('refuses service-role and secret keys in the browser build', () => {
    expect(() => assertPublicKey(jwt({ role: 'service_role' }))).toThrow(/service-role/);
    expect(() => assertPublicKey('sb_secret_abc123')).toThrow();
  });
  it('accepts anon and publishable keys', () => {
    expect(() => assertPublicKey(jwt({ role: 'anon' }))).not.toThrow();
    expect(() => assertPublicKey('sb_publishable_abc123')).not.toThrow();
  });
});

describe('normalizePhone (mirrors the database)', () => {
  it.each([
    ['98765 43210', '+919876543210'],
    ['098765 43210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('%s → %s', (input, out) => expect(normalizePhone(input)).toBe(out));
  it.each(['12345', '5876543210', '', 'call me', '+0123456789'])('rejects %j', (input) => expect(normalizePhone(input)).toBeNull());
});

describe('normalizeReference', () => {
  it('accepts references typed without dashes or in lower case', () => {
    expect(normalizeReference('pry k7q2 m9xd')).toBe('PRY-K7Q2-M9XD');
    expect(normalizeReference('K7Q2M9XD')).toBe('PRY-K7Q2-M9XD');
  });
});

describe('passwordProblems (mirrors the Auth policy)', () => {
  it('lists what is missing', () => {
    expect(passwordProblems('short')).toEqual(['at least 10 characters', 'an uppercase letter', 'a number']);
    expect(passwordProblems('Longenough1')).toEqual([]);
  });
});

describe('sanitizeSearch', () => {
  it('removes characters with meaning in PostgREST filters', () => {
    expect(sanitizeSearch('a,b.or(id.eq.1)*%_"\'\\:')).toBe('a b or id eq 1');
    expect(sanitizeSearch('x'.repeat(200))).toHaveLength(80);
  });
});

describe('slugify', () => {
  it('produces URL-safe slugs', () => {
    expect(slugify('Winter Blankets & Food — 2026!')).toBe('winter-blankets-and-food-2026');
    expect(slugify('Café Été')).toBe('cafe-ete');
    expect(SLUG_PATTERN.test(slugify('प्रयास', 'project'))).toBe(true);
    expect(slugify('प्रयास', 'project')).toMatch(/^project-[a-f0-9]{8}$/);
  });
});

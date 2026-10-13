import { describe, expect, it } from 'vitest';
import { dbErrorToHttp } from '@shared/http.ts';
import { AppError, errorMessage, toAppError } from './errors';

/** Raw messages Postgres/PostgREST can produce; none may reach the screen. */
const RAW = [
  { code: '42501', message: 'permission denied for table ledger_entries', hint: null },
  { code: '42501', message: 'new row violates row-level security policy for table "assistance_requests"', hint: null },
  { code: '23505', message: 'duplicate key value violates unique constraint "ledger_entries_reference_key"', hint: null, details: 'Key (transaction_reference)=(UTR1) already exists.' },
  { code: '23514', message: 'new row for relation "volunteers" violates check constraint "volunteers_guardian"', hint: null },
  { code: '22023', message: 'invalid input syntax for type uuid: "x"', hint: null },
  { code: 'P0001', message: 'unexpected internal failure in private.some_function()', hint: null },
  { code: '42703', message: 'column projects.secret does not exist', hint: 'Perhaps you meant to reference the column "projects.slug".' },
  { code: 'PGRST204', message: "Could not find the 'x' column of 'projects' in the schema cache", hint: null },
  { code: '57014', message: 'canceling statement due to statement timeout', hint: null },
];

const INTERNAL = /ledger_entries|assistance_requests|volunteers|constraint|relation|uuid|private\.|column|schema|statement|Key \(/;

describe('toAppError never shows raw database messages', () => {
  it.each(RAW)('$code: $message', (raw) => {
    const message = errorMessage(raw);
    expect(message).not.toMatch(INTERNAL);
    expect(message.length).toBeGreaterThan(10);
  });

  it('shows messages the application wrote for people (with a code in hint)', () => {
    const e = toAppError({ code: 'P0001', message: 'An administrator already exists.', hint: 'admin_exists' });
    expect(e.message).toBe('An administrator already exists.');
    expect(e.code).toBe('admin_exists');
    const v = toAppError({ code: '22023', message: 'Enter a valid phone number.', hint: 'invalid:phone' });
    expect(v.fields).toEqual({ phone: 'Enter a valid phone number.' });
  });

  it('turns unexpected exceptions into a generic message', () => {
    expect(errorMessage(new Error('TypeError: cannot read properties of undefined (reading "id") at Foo.tsx:12'))).toBe('Something went wrong. Please try again.');
    expect(errorMessage('boom')).toBe('Something went wrong. Please try again.');
  });

  it('keeps messages deliberately written as AppError', () => {
    expect(errorMessage(new AppError('validation', 'Files must be 10 MB or smaller.'))).toBe('Files must be 10 MB or smaller.');
  });
});

describe('Edge Functions never return raw database messages', () => {
  it.each(RAW)('$code: $message', (raw) => {
    const http = dbErrorToHttp(raw);
    expect(http.message).not.toMatch(INTERNAL);
    expect(http.fields).toBeUndefined();
  });

  it('passes through messages written for people', () => {
    const http = dbErrorToHttp({ code: '22023', message: 'Enter a valid phone number.', hint: 'invalid:phone' });
    expect(http.status).toBe(422);
    expect(http.fields).toEqual({ phone: 'Enter a valid phone number.' });
    expect(dbErrorToHttp({ code: '42501', message: 'You must be signed in.', hint: 'not_authenticated' }).status).toBe(403);
  });
});

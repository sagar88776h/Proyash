import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, createUser, expectOk, stack } from '../helpers/stack';
import { totp } from '../helpers/totp';

afterAll(closePool);

describe('multi-factor assurance', () => {
  it('withholds roles from password-only sessions once MFA is enrolled', async () => {
    const user = await createUser(['treasurer'], 'mfa');
    const enroll = await user.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Test phone' });
    expect(enroll.error).toBeNull();
    const factorId = enroll.data!.id;
    const secret = enroll.data!.totp.secret;
    // Before verification the factor is unverified: nothing changes.
    expect(expectOk(await user.client.rpc('my_roles'))).toEqual(['treasurer']);

    const verified = await user.client.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) });
    expect(verified.error).toBeNull();
    expect(expectOk(await user.client.rpc('my_roles'))).toEqual(['treasurer']);

    // A fresh password-only sign-in (aal1) no longer carries the role…
    const second = createClient(stack.apiUrl, stack.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await second.auth.signInWithPassword({ email: user.email, password: user.password })).error).toBeNull();
    expect(expectOk(await second.rpc('my_roles'))).toEqual([]);
    expect(expectOk(await second.from('ledger_entries').select('id').limit(1))).toEqual([]);

    // …until the second factor is completed.
    const challenge = await second.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) });
    expect(challenge.error).toBeNull();
    expect(expectOk(await second.rpc('my_roles'))).toEqual(['treasurer']);
  });
});

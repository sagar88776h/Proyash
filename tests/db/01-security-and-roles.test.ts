import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  closePool,
  createUser,
  expectFailure,
  expectOk,
  serviceClient,
  sql,
  type TestUser,
} from '../helpers/stack';

afterAll(closePool);

describe('security invariants', () => {
  it('passes the in-database assertion function', async () => {
    await expect(sql('select private.assert_security_invariants()')).resolves.toBeDefined();
  });

  it('enables RLS on every table in the public schema', async () => {
    const rows = await sql<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it('exposes no functions to anonymous visitors except the public aggregates', async () => {
    const rows = await sql<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`,
    );
    expect(rows.map((r) => r.proname)).toEqual(['get_project_finance', 'get_public_impact_summary']);
  });

  it('does not expose the private schema through the API', async () => {
    const res = await anonClient().schema('private' as 'public').rpc('current_roles');
    expect(res.error).not.toBeNull();
  });
});

describe('first administrator provisioning', () => {
  it('cannot be called by anonymous or signed-in users', async () => {
    expectFailure(await anonClient().rpc('bootstrap_first_admin', { p_email: 'a@b.cd' }), { code: '42501' });
    const someone = await createUser([], 'nobody');
    expectFailure(await someone.client.rpc('bootstrap_first_admin', { p_email: someone.email }), { code: '42501' });
  });

  it('works once with the service role and then refuses', async () => {
    const existing = await sql<{ n: number }>(
      `select count(*)::int as n from public.user_roles ur join public.profiles p on p.id = ur.user_id
       where ur.role = 'admin' and p.is_active`,
    );
    const candidate = await createUser([], 'first-admin');
    const service = serviceClient();
    const result = await service.rpc('bootstrap_first_admin', { p_email: candidate.email });
    if (existing[0]!.n === 0) {
      expect(result.error).toBeNull();
      expect(result.data).toBe(candidate.id);
    }
    // Now an admin exists: a second bootstrap must fail.
    const again = await service.rpc('bootstrap_first_admin', { p_email: candidate.email });
    expectFailure(again, { hint: 'admin_exists' });
  });
});

describe('role management', () => {
  let admin: TestUser;
  let otherAdmin: TestUser;
  let target: TestUser;

  beforeAll(async () => {
    admin = await createUser(['admin'], 'admin');
    otherAdmin = await createUser(['admin'], 'admin2');
    target = await createUser([], 'target');
  });

  it('lets admins grant and replace roles', async () => {
    const roles = expectOk(
      await admin.client.rpc('admin_set_user_roles', { p_user_id: target.id, p_roles: ['treasurer', 'publisher'] }),
    );
    expect(roles).toEqual(['treasurer', 'publisher']);
    const replaced = expectOk(await admin.client.rpc('admin_set_user_roles', { p_user_id: target.id, p_roles: ['publisher'] }));
    expect(replaced).toEqual(['publisher']);
  });

  it('records role changes in the audit log with the acting admin', async () => {
    const rows = await sql<{ actor_id: string }>(
      `select actor_id from public.activity_logs where entity_type = 'user_roles' and entity_id like $1 order by id desc limit 1`,
      [`${target.id}:%`],
    );
    expect(rows[0]?.actor_id).toBe(admin.id);
  });

  it('prevents non-admins from changing roles, including their own (no privilege escalation)', async () => {
    const treasurer = await createUser(['treasurer'], 'treasurer');
    expectFailure(
      await treasurer.client.rpc('admin_set_user_roles', { p_user_id: treasurer.id, p_roles: ['admin'] }),
      { hint: 'forbidden' },
    );
    expectFailure(await treasurer.client.from('user_roles').insert({ user_id: treasurer.id, role: 'admin' }), {
      code: '42501',
    });
    const roles = await sql(`select role from public.user_roles where user_id = $1`, [treasurer.id]);
    expect(roles).toEqual([{ role: 'treasurer' }]);
  });

  it('stops an admin removing their own admin role', async () => {
    expectFailure(await admin.client.rpc('admin_set_user_roles', { p_user_id: admin.id, p_roles: ['treasurer'] }), {
      hint: 'cannot_remove_own_admin',
    });
  });

  it('stops admins deactivating themselves', async () => {
    expectFailure(await admin.client.rpc('admin_set_user_active', { p_user_id: admin.id, p_active: false }), {
      hint: 'cannot_deactivate_self',
    });
  });

  it('removes all permissions from a deactivated account immediately', async () => {
    const reviewer = await createUser(['assistance_reviewer'], 'reviewer');
    expectOk(await reviewer.client.from('assistance_requests').select('id').limit(1));
    expectOk(await otherAdmin.client.rpc('admin_set_user_active', { p_user_id: reviewer.id, p_active: false }));
    // Same (still valid) JWT, but RLS no longer finds an active role.
    const after = expectOk(await reviewer.client.rpc('my_roles'));
    expect(after).toEqual([]);
    const rows = expectOk(await reviewer.client.from('assistance_requests').select('id').limit(1));
    expect(rows).toEqual([]);
  });

  it('lets users update only their own display name', async () => {
    const user = await createUser(['publisher'], 'self');
    expectOk(await user.client.from('profiles').update({ full_name: 'New Name' }).eq('id', user.id));
    const [row] = await sql<{ full_name: string }>('select full_name from public.profiles where id = $1', [user.id]);
    expect(row?.full_name).toBe('New Name');
    expectFailure(await user.client.from('profiles').update({ is_active: false }).eq('id', user.id), { code: '42501' });
    // Updating someone else's profile affects no rows.
    await user.client.from('profiles').update({ full_name: 'Hacked' }).eq('id', admin.id);
    const [adminRow] = await sql<{ full_name: string }>('select full_name from public.profiles where id = $1', [admin.id]);
    expect(adminRow?.full_name).not.toBe('Hacked');
  });

  it('never trusts user-editable metadata for roles', async () => {
    const user = await createUser([], 'meta');
    await user.client.auth.updateUser({ data: { roles: ['admin'], role: 'admin' } });
    await user.client.auth.refreshSession();
    expect(expectOk(await user.client.rpc('my_roles'))).toEqual([]);
  });

  it('allows a signed-in user without roles to read nothing private', async () => {
    const nobody = await createUser([], 'noroles');
    for (const table of ['assistance_requests', 'volunteers', 'ledger_entries', 'donations', 'contact_messages', 'activity_logs']) {
      const res = await nobody.client.from(table).select('*').limit(1);
      expect(res.error, table).toBeNull();
      expect(res.data, table).toEqual([]);
    }
  });
});

-- =============================================================================
-- PRAYASH · 0100 · Foundation: schemas, default privileges, enums, profiles,
-- roles and role-management functions.
--
-- Security model (see docs/SECURITY.md):
--   * Row Level Security is enabled on every table. No policy = no access.
--   * Supabase grants broad table/function privileges to anon/authenticated by
--     default. We tighten those defaults here and grant explicitly per object.
--   * Internal helpers live in the `private` schema, which PostgREST does not
--     expose. Public RPCs are SECURITY DEFINER with an empty search_path and
--     re-check the caller's role before doing anything.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Schemas and default privileges
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
-- RLS policies (evaluated as the calling role) need to call private helpers.
grant usage on schema private to authenticated, service_role;

-- Functions are no longer executable by everyone by default; each function
-- below grants EXECUTE explicitly to the roles that need it.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema private revoke execute on functions from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------
create type public.app_role as enum (
  'admin',
  'treasurer',
  'assistance_reviewer',
  'volunteer_coordinator',
  'publisher',
  'volunteer'
);

create type public.activity_category as enum (
  'education',
  'healthcare',
  'food_security',
  'essential_needs',
  'environment',
  'community_development',
  'emergency_relief',
  'other'
);

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Safe text -> uuid cast (returns null instead of raising).
create function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function private.try_uuid(text) to authenticated, service_role;

-- Raises a business-rule error. `code` is a stable machine-readable identifier
-- returned to clients in the `hint` field; `message` is human readable.
create function private.fail(p_code text, p_message text, p_errcode text default 'P0001')
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = p_errcode, message = p_message, hint = p_code;
end;
$$;
grant execute on function private.fail(text, text, text) to authenticated, service_role;

-- Normalises a phone number to E.164. Indian numbers may be entered with or
-- without +91 / 0 prefixes. Returns null when the input is not a plausible
-- phone number.
create function private.normalize_phone(p_input text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_plus boolean;
  v_digits text;
begin
  if p_input is null then
    return null;
  end if;
  v_plus := left(btrim(p_input), 1) = '+';
  v_digits := regexp_replace(p_input, '[^0-9]', '', 'g');
  if v_digits = '' then
    return null;
  end if;
  if not v_plus and char_length(v_digits) = 10 and v_digits ~ '^[6-9]' then
    return '+91' || v_digits;
  end if;
  -- 0 + STD code + number (landline) or 0 + mobile number
  if not v_plus and char_length(v_digits) = 11 and v_digits ~ '^0[1-9]' then
    return '+91' || substr(v_digits, 2);
  end if;
  if char_length(v_digits) = 12 and v_digits ~ '^91[1-9]' then
    return '+' || v_digits;
  end if;
  if v_plus and char_length(v_digits) between 8 and 15 and v_digits !~ '^0' then
    return '+' || v_digits;
  end if;
  return null;
end;
$$;
grant execute on function private.normalize_phone(text) to authenticated, service_role;

create function private.is_valid_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_email is not null
    and char_length(p_email) <= 254
    and p_email ~* '^[a-z0-9._%+''-]+@[a-z0-9.-]+\.[a-z]{2,}$';
$$;
grant execute on function private.is_valid_email(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Profiles (one per auth user) and roles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text check (email is null or char_length(email) <= 254),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Staff/volunteer account profile. Deactivate instead of deleting so the audit trail stays intact.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
create index user_roles_role_idx on public.user_roles (role);
comment on table public.user_roles is 'Role assignments. Writable only through admin_set_user_roles() / bootstrap_first_admin().';

-- Current caller's roles (empty when signed out or deactivated).
create function private.current_roles()
returns public.app_role[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(ur.role order by ur.role), '{}'::public.app_role[])
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.user_id = (select auth.uid())
    and p.is_active;
$$;

create function private.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_role = any (private.current_roles());
$$;

create function private.has_any_role(p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_roles() && p_roles;
$$;

-- Staff = any role other than `volunteer`.
create function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_roles() && array[
    'admin', 'treasurer', 'assistance_reviewer', 'volunteer_coordinator', 'publisher'
  ]::public.app_role[];
$$;

create function private.require_role(p_roles public.app_role[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    perform private.fail('not_authenticated', 'You must be signed in.', '42501');
  end if;
  if not private.has_any_role(p_roles) then
    perform private.fail('forbidden', 'You do not have permission to perform this action.', '42501');
  end if;
end;
$$;

grant execute on function private.current_roles() to authenticated, service_role;
grant execute on function private.has_role(public.app_role) to authenticated, service_role;
grant execute on function private.has_any_role(public.app_role[]) to authenticated, service_role;
grant execute on function private.is_staff() to authenticated, service_role;
grant execute on function private.require_role(public.app_role[]) to authenticated, service_role;

-- Create a profile automatically for every new auth user.
create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(left(btrim(new.raw_user_meta_data ->> 'full_name'), 120), ''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create function private.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.sync_auth_user_email();

-- -----------------------------------------------------------------------------
-- Privileges and RLS: profiles, user_roles
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.user_roles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Staff read team profiles"
  on public.profiles for select to authenticated
  using ((select private.is_staff()));

create policy "Users update their own name"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Users read their own roles"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Admins read all roles"
  on public.user_roles for select to authenticated
  using ((select private.has_role('admin')));

-- -----------------------------------------------------------------------------
-- Role management
-- -----------------------------------------------------------------------------
create function private.active_admin_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.role = 'admin' and p.is_active;
$$;

-- Replace a user's roles with exactly `p_roles`. Admin only.
-- Guards: an admin cannot remove their own admin role, and the last active
-- administrator can never be removed.
create function public.admin_set_user_roles(p_user_id uuid, p_roles public.app_role[])
returns public.app_role[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_roles public.app_role[] := coalesce(p_roles, '{}');
begin
  perform private.require_role(array['admin']::public.app_role[]);

  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform private.fail('not_found', 'User not found.');
  end if;

  if p_user_id = v_caller and not ('admin' = any (v_roles)) then
    perform private.fail('cannot_remove_own_admin', 'You cannot remove your own administrator role. Ask another administrator.');
  end if;

  delete from public.user_roles
  where user_id = p_user_id and not (role = any (v_roles));

  insert into public.user_roles (user_id, role, granted_by)
  select p_user_id, r, v_caller
  from unnest(v_roles) as r
  on conflict (user_id, role) do nothing;

  if private.active_admin_count() < 1 then
    perform private.fail('last_admin', 'At least one active administrator is required.');
  end if;

  return (
    select coalesce(array_agg(role order by role), '{}')
    from public.user_roles where user_id = p_user_id
  );
end;
$$;

-- Activate/deactivate an account. Deactivated users immediately lose every
-- permission (roles are only honoured for active profiles). The staff-api
-- edge function additionally bans the auth user so their sessions end.
create function public.admin_set_user_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(array['admin']::public.app_role[]);

  if p_user_id = (select auth.uid()) and not p_active then
    perform private.fail('cannot_deactivate_self', 'You cannot deactivate your own account.');
  end if;

  update public.profiles set is_active = p_active where id = p_user_id;
  if not found then
    perform private.fail('not_found', 'User not found.');
  end if;

  if private.active_admin_count() < 1 then
    perform private.fail('last_admin', 'At least one active administrator is required.');
  end if;
end;
$$;

-- One-time provisioning of the first administrator. Not callable by anon or
-- authenticated users: run it from the Supabase SQL editor (as postgres) or
-- through scripts/provision-admin.mjs (service role). It refuses to run once
-- any active administrator exists, so it cannot be used to escalate later.
create function public.bootstrap_first_admin(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if private.active_admin_count() > 0 then
    perform private.fail('admin_exists', 'An administrator already exists. Use the admin portal to manage roles.');
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(btrim(p_email))
  limit 1;

  if v_user_id is null then
    perform private.fail('not_found', 'No auth user with that email. Invite the user first.');
  end if;

  insert into public.profiles (id, email)
  values (v_user_id, lower(btrim(p_email)))
  on conflict (id) do update set is_active = true;

  insert into public.user_roles (user_id, role, granted_by)
  values (v_user_id, 'admin', null)
  on conflict do nothing;

  return v_user_id;
end;
$$;

revoke all on function public.admin_set_user_roles(uuid, public.app_role[]) from public, anon, authenticated;
revoke all on function public.admin_set_user_active(uuid, boolean) from public, anon, authenticated;
revoke all on function public.bootstrap_first_admin(text) from public, anon, authenticated;
grant execute on function public.admin_set_user_roles(uuid, public.app_role[]) to authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;
grant execute on function public.bootstrap_first_admin(text) to service_role;

-- Roles of the signed-in user (used by the frontend to shape navigation;
-- the database still enforces every permission independently).
create function public.my_roles()
returns public.app_role[]
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_roles();
$$;
revoke all on function public.my_roles() from public, anon;
grant execute on function public.my_roles() to authenticated;

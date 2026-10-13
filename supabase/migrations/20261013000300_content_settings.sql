-- =============================================================================
-- PRAYASH · 0300 · Site settings, editable page content, contact messages
--
-- Nothing here contains invented organisational facts: settings are seeded
-- with null values and the site shows labelled placeholders until an
-- administrator fills them in.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Site settings (key → JSON object). Admin-only writes; payment details are a
-- fraud target, so every change is audit-logged with old and new values.
-- -----------------------------------------------------------------------------
create table public.site_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]{1,63}$'),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  is_public boolean not null default false,
  description text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create function private.json_opt_text(p_obj jsonb, p_key text, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not (p_obj ? p_key)
    or jsonb_typeof(p_obj -> p_key) = 'null'
    or (jsonb_typeof(p_obj -> p_key) = 'string' and char_length(p_obj ->> p_key) <= p_max);
$$;

create function private.json_has_only(p_obj jsonb, p_allowed text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce((select array_agg(k) from jsonb_object_keys(p_obj) as k) <@ p_allowed, true);
$$;

create function private.json_opt_https_url(p_obj jsonb, p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.json_opt_text(p_obj, p_key, 500)
    and (
      p_obj ->> p_key is null
      or (p_obj ->> p_key) ~ '^https://[^\s<>"]+$'
    );
$$;

grant execute on function private.json_opt_text(jsonb, text, integer) to authenticated, service_role;
grant execute on function private.json_has_only(jsonb, text[]) to authenticated, service_role;
grant execute on function private.json_opt_https_url(jsonb, text) to authenticated, service_role;

create function private.validate_site_setting()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v jsonb := new.value;
  v_bank jsonb;
begin
  case new.key
    when 'contact' then
      if not (
        private.json_has_only(v, array['phone', 'whatsapp', 'email', 'address', 'hours', 'map_url'])
        and private.json_opt_text(v, 'phone', 30)
        and private.json_opt_text(v, 'whatsapp', 30)
        and private.json_opt_text(v, 'email', 254)
        and private.json_opt_text(v, 'address', 500)
        and private.json_opt_text(v, 'hours', 200)
        and private.json_opt_https_url(v, 'map_url')
        and (v ->> 'email' is null or private.is_valid_email(v ->> 'email'))
        and (v ->> 'phone' is null or private.normalize_phone(v ->> 'phone') is not null)
        and (v ->> 'whatsapp' is null or private.normalize_phone(v ->> 'whatsapp') is not null)
      ) then
        perform private.fail('invalid_setting', 'Contact details are not valid. Check the phone numbers, email and map link.', '22023');
      end if;

    when 'social' then
      if not (
        private.json_has_only(v, array['facebook', 'instagram', 'youtube', 'x', 'linkedin'])
        and private.json_opt_https_url(v, 'facebook')
        and private.json_opt_https_url(v, 'instagram')
        and private.json_opt_https_url(v, 'youtube')
        and private.json_opt_https_url(v, 'x')
        and private.json_opt_https_url(v, 'linkedin')
      ) then
        perform private.fail('invalid_setting', 'Social links must be full https:// addresses.', '22023');
      end if;

    when 'donation' then
      v_bank := v -> 'bank';
      if not (
        private.json_has_only(v, array['accepting', 'upi_id', 'payee_name', 'bank', 'instructions'])
        and (not (v ? 'accepting') or jsonb_typeof(v -> 'accepting') = 'boolean')
        and private.json_opt_text(v, 'upi_id', 100)
        and (v ->> 'upi_id' is null or (v ->> 'upi_id') ~ '^[A-Za-z0-9._-]{2,99}@[A-Za-z][A-Za-z0-9]{1,63}$')
        and private.json_opt_text(v, 'payee_name', 100)
        and private.json_opt_text(v, 'instructions', 2000)
        and (
          v_bank is null or jsonb_typeof(v_bank) = 'null' or (
            jsonb_typeof(v_bank) = 'object'
            and private.json_has_only(v_bank, array['account_name', 'bank_name', 'account_number', 'ifsc', 'branch'])
            and private.json_opt_text(v_bank, 'account_name', 120)
            and private.json_opt_text(v_bank, 'bank_name', 120)
            and private.json_opt_text(v_bank, 'branch', 120)
            and (v_bank ->> 'account_number' is null or (v_bank ->> 'account_number') ~ '^[0-9]{6,20}$')
            and (v_bank ->> 'ifsc' is null or (v_bank ->> 'ifsc') ~ '^[A-Z]{4}0[A-Z0-9]{6}$')
          )
        )
      ) then
        perform private.fail('invalid_setting', 'Payment details are not valid. Check the UPI ID, account number and IFSC code.', '22023');
      end if;

    when 'organisation' then
      if not (
        private.json_has_only(v, array['legal_name', 'registration_details', 'established_year'])
        and private.json_opt_text(v, 'legal_name', 160)
        and private.json_opt_text(v, 'registration_details', 500)
        and (
          not (v ? 'established_year')
          or jsonb_typeof(v -> 'established_year') = 'null'
          or (
            jsonb_typeof(v -> 'established_year') = 'number'
            and (v ->> 'established_year')::numeric between 1900 and extract(year from now())
          )
        )
      ) then
        perform private.fail('invalid_setting', 'Organisation details are not valid.', '22023');
      end if;

    when 'finance.controls' then
      if not (
        private.json_has_only(v, array['require_independent_verification', 'require_independent_report_approval'])
        and jsonb_typeof(v -> 'require_independent_verification') = 'boolean'
        and jsonb_typeof(v -> 'require_independent_report_approval') = 'boolean'
      ) then
        perform private.fail('invalid_setting', 'Finance controls must be true/false values.', '22023');
      end if;

    else
      perform private.fail('unknown_setting', 'Unknown setting key.', '22023');
  end case;

  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger site_settings_validate
  before insert or update on public.site_settings
  for each row execute function private.validate_site_setting();

insert into public.site_settings (key, value, is_public, description) values
  ('contact',
   '{"phone": null, "whatsapp": null, "email": null, "address": null, "hours": null, "map_url": null}',
   true, 'Official contact details shown in the footer and Contact page.'),
  ('social',
   '{"facebook": null, "instagram": null, "youtube": null, "x": null, "linkedin": null}',
   true, 'Official social media links.'),
  ('donation',
   '{"accepting": false, "upi_id": null, "payee_name": null, "bank": null, "instructions": null}',
   true, 'Authorised organisational payment method shown on the Support Us page.'),
  ('organisation',
   '{"legal_name": null, "registration_details": null, "established_year": null}',
   true, 'Registration and establishment details. Leave empty unless officially confirmed.'),
  ('finance.controls',
   '{"require_independent_verification": true, "require_independent_report_approval": true}',
   false, 'Four-eyes controls for verifying ledger entries and approving public reports.');

alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant update (value) on public.site_settings to authenticated;

create policy "Anyone reads public settings"
  on public.site_settings for select to anon, authenticated
  using (is_public);

create policy "Staff read all settings"
  on public.site_settings for select to authenticated
  using ((select private.is_staff()));

create policy "Admins update settings"
  on public.site_settings for update to authenticated
  using ((select private.has_role('admin')))
  with check ((select private.has_role('admin')));

create trigger site_settings_audit
  after insert or update or delete on public.site_settings
  for each row execute function private.audit_row_change('values');

create function private.setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.site_settings where key = p_key;
$$;
grant execute on function private.setting(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Editable page content: drafts are private; only published JSON is public.
-- -----------------------------------------------------------------------------
create table public.site_content (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  draft jsonb check (draft is null or (jsonb_typeof(draft) = 'object' and pg_column_size(draft) < 262144)),
  published jsonb check (published is null or jsonb_typeof(published) = 'object'),
  draft_updated_by uuid references public.profiles (id) on delete set null,
  draft_updated_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.site_content is 'Page content overrides. The frontend falls back to documented defaults (src/content/registry.ts) for anything not published here.';

create table public.site_content_versions (
  id bigint generated always as identity primary key,
  content_key text not null references public.site_content (key) on delete cascade,
  version integer not null,
  content jsonb not null,
  published_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz not null default now(),
  unique (content_key, version)
);

create trigger site_content_set_updated_at
  before update on public.site_content
  for each row execute function private.set_updated_at();

create function private.site_content_track_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.draft is distinct from old.draft then
    new.draft_updated_by := (select auth.uid());
    new.draft_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger site_content_track_draft
  before insert or update on public.site_content
  for each row execute function private.site_content_track_draft();

insert into public.site_content (key) values
  ('home'), ('about'), ('our_work'), ('villages'), ('request_help'), ('donate'),
  ('volunteer'), ('transparency'), ('contact'), ('privacy'), ('terms');

alter table public.site_content enable row level security;
alter table public.site_content_versions enable row level security;
revoke all on public.site_content from anon, authenticated;
revoke all on public.site_content_versions from anon, authenticated;
grant select (key, published, published_at, version) on public.site_content to anon;
grant select on public.site_content to authenticated;
grant update (draft) on public.site_content to authenticated;
grant select on public.site_content_versions to authenticated;

create policy "Anyone reads published content"
  on public.site_content for select to anon, authenticated
  using (published is not null);

create policy "Content editors read drafts"
  on public.site_content for select to authenticated
  using ((select private.has_any_role(array['admin', 'publisher']::public.app_role[])));

create policy "Content editors edit drafts"
  on public.site_content for update to authenticated
  using ((select private.has_any_role(array['admin', 'publisher']::public.app_role[])))
  with check ((select private.has_any_role(array['admin', 'publisher']::public.app_role[])));

create policy "Content editors read versions"
  on public.site_content_versions for select to authenticated
  using ((select private.has_any_role(array['admin', 'publisher']::public.app_role[])));

create trigger site_content_audit
  after update on public.site_content
  for each row execute function private.audit_row_change('fields', 'version,published_at');

-- Publish the current draft of a page.
create function public.publish_site_content(p_key text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.site_content;
begin
  perform private.require_role(array['admin', 'publisher']::public.app_role[]);

  select * into v_row from public.site_content where key = p_key for update;
  if not found then
    perform private.fail('not_found', 'Unknown content page.');
  end if;
  if v_row.draft is null then
    perform private.fail('no_draft', 'There is no draft to publish.');
  end if;

  update public.site_content
  set published = v_row.draft,
      published_by = (select auth.uid()),
      published_at = now(),
      version = v_row.version + 1
  where key = p_key;

  insert into public.site_content_versions (content_key, version, content, published_by)
  values (p_key, v_row.version + 1, v_row.draft, (select auth.uid()));

  return v_row.version + 1;
end;
$$;

-- Remove the published override so the page falls back to its defaults.
create function public.unpublish_site_content(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(array['admin', 'publisher']::public.app_role[]);
  update public.site_content
  set published = null, published_by = (select auth.uid()), published_at = now()
  where key = p_key;
  if not found then
    perform private.fail('not_found', 'Unknown content page.');
  end if;
end;
$$;

revoke all on function public.publish_site_content(text) from public, anon, authenticated;
revoke all on function public.unpublish_site_content(text) from public, anon, authenticated;
grant execute on function public.publish_site_content(text) to authenticated;
grant execute on function public.unpublish_site_content(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Contact messages (written by the public-api edge function only)
-- -----------------------------------------------------------------------------
create type public.message_status as enum ('new', 'in_progress', 'closed');

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  email text check (email is null or private.is_valid_email(email)),
  phone text check (phone is null or char_length(phone) <= 20),
  subject text not null check (char_length(btrim(subject)) between 2 and 150),
  message text not null check (char_length(btrim(message)) between 10 and 4000),
  status public.message_status not null default 'new',
  handled_by uuid references public.profiles (id) on delete set null,
  client_submission_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_messages_reply_channel check (email is not null or phone is not null)
);
create index contact_messages_status_idx on public.contact_messages (status, created_at desc);

create trigger contact_messages_set_updated_at
  before update on public.contact_messages
  for each row execute function private.set_updated_at();

alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;
grant select on public.contact_messages to authenticated;
grant update (status, handled_by) on public.contact_messages to authenticated;

create policy "Admins read contact messages"
  on public.contact_messages for select to authenticated
  using ((select private.has_role('admin')));

create policy "Admins update contact messages"
  on public.contact_messages for update to authenticated
  using ((select private.has_role('admin')))
  with check ((select private.has_role('admin')));

create trigger contact_messages_audit
  after insert or update on public.contact_messages
  for each row execute function private.audit_row_change('fields', 'status,handled_by');

create function public.submit_contact_message(
  p_name text,
  p_email text,
  p_phone text,
  p_subject text,
  p_message text,
  p_client_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_email text := nullif(lower(btrim(p_email)), '');
begin
  if nullif(btrim(p_phone), '') is not null then
    v_phone := private.normalize_phone(p_phone);
    if v_phone is null then
      perform private.fail('invalid:phone', 'Enter a valid phone number.', '22023');
    end if;
  end if;
  if v_email is not null and not private.is_valid_email(v_email) then
    perform private.fail('invalid:email', 'Enter a valid email address.', '22023');
  end if;
  if v_email is null and v_phone is null then
    perform private.fail('invalid:email', 'Provide an email address or phone number so we can reply.', '22023');
  end if;

  if p_client_submission_id is not null
     and exists (select 1 from public.contact_messages where client_submission_id = p_client_submission_id) then
    return jsonb_build_object('result', 'replayed');
  end if;

  insert into public.contact_messages (name, email, phone, subject, message, client_submission_id)
  values (btrim(p_name), v_email, v_phone, btrim(p_subject), btrim(p_message), p_client_submission_id);

  return jsonb_build_object('result', 'created');
end;
$$;
revoke all on function public.submit_contact_message(text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_contact_message(text, text, text, text, text, uuid) to service_role;

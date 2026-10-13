-- =============================================================================
-- PRAYASH · 0500 · Assistance requests
--
-- Privacy
--   * Requests are readable only by assistance reviewers and administrators.
--   * There are no direct INSERT/UPDATE/DELETE privileges: every change goes
--     through the functions below, which validate input and enforce the
--     status workflow.
--   * Public submission, status lookup and follow-up are executable only by
--     the service role (i.e. the public-api edge function, which adds spam
--     protection and rate limiting). The applicant needs both the reference
--     number and the phone number used on the form to see a status.
--   * The audit log records only field names (plus status/assignment values)
--     for these tables, never personal content.
-- =============================================================================

create type public.assistance_category as enum ('education', 'medical', 'food', 'essential_needs', 'other');
create type public.assistance_status as enum (
  'pending',
  'under_review',
  'more_information_required',
  'approved',
  'declined',
  'assistance_provided'
);
create type public.assistance_urgency as enum ('standard', 'urgent');
create type public.requester_relationship as enum ('self', 'family_member', 'neighbour', 'community_member', 'other');
create type public.contact_method as enum ('phone_call', 'whatsapp', 'sms', 'email');
create type public.request_source as enum ('web_form', 'staff_entry');

create table public.assistance_requests (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique check (reference_code ~ '^PRY-[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  category public.assistance_category not null,
  urgency public.assistance_urgency not null default 'standard',
  applicant_name text check (char_length(applicant_name) <= 120),
  phone text check (char_length(phone) <= 20),
  email text check (email is null or private.is_valid_email(email)),
  village_id uuid references public.villages (id) on delete set null,
  locality text check (char_length(locality) <= 160),
  description text not null check (char_length(description) <= 3000),
  requester_relationship public.requester_relationship not null default 'self',
  preferred_contact public.contact_method not null default 'phone_call',
  consent_at timestamptz not null,
  status public.assistance_status not null default 'pending',
  assigned_reviewer_id uuid references public.profiles (id) on delete set null,
  applicant_message text check (char_length(applicant_message) <= 600),
  source public.request_source not null default 'web_form',
  recorded_by uuid references public.profiles (id) on delete set null,
  client_submission_id uuid unique,
  has_unread_followup boolean not null default false,
  status_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  redacted_at timestamptz,
  redacted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistance_personal_data_present check (
    redacted_at is not null or (
      char_length(btrim(applicant_name)) >= 2
      and phone is not null
      and char_length(btrim(description)) >= 20
      and (village_id is not null or char_length(btrim(locality)) >= 2)
    )
  ),
  constraint assistance_closed_at check ((status in ('declined', 'assistance_provided')) = (closed_at is not null)),
  constraint assistance_staff_entry check (source <> 'staff_entry' or recorded_by is not null or redacted_at is not null)
);
comment on table public.assistance_requests is 'Private. Applications for assistance; never exposed publicly.';

create index assistance_requests_status_idx on public.assistance_requests (status, created_at desc);
create index assistance_requests_phone_idx on public.assistance_requests (phone, category) where redacted_at is null;
create index assistance_requests_reviewer_idx on public.assistance_requests (assigned_reviewer_id, status);
create index assistance_requests_created_idx on public.assistance_requests (created_at desc);

create trigger assistance_requests_set_updated_at
  before update on public.assistance_requests
  for each row execute function private.set_updated_at();

create table public.assistance_request_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.assistance_requests (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index assistance_request_notes_request_idx on public.assistance_request_notes (request_id, created_at);

create table public.assistance_status_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.assistance_requests (id) on delete cascade,
  from_status public.assistance_status,
  to_status public.assistance_status not null,
  changed_by uuid references public.profiles (id) on delete set null,
  reason text check (char_length(reason) <= 1000),
  created_at timestamptz not null default now()
);
create index assistance_status_history_request_idx on public.assistance_status_history (request_id, created_at);

create table public.assistance_followups (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.assistance_requests (id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  attachment_path text unique check (char_length(attachment_path) <= 300),
  attachment_name text check (char_length(attachment_name) <= 200),
  attachment_mime text check (attachment_mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  attachment_size integer check (attachment_size > 0 and attachment_size <= 5242880),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid references public.profiles (id) on delete set null,
  constraint followup_attachment_complete check (
    (attachment_path is null) = (attachment_name is null)
    and (attachment_path is null) = (attachment_mime is null)
    and (attachment_path is null) = (attachment_size is null)
  )
);
create index assistance_followups_request_idx on public.assistance_followups (request_id, created_at);

-- -----------------------------------------------------------------------------
-- Privileges and RLS
-- -----------------------------------------------------------------------------
alter table public.assistance_requests enable row level security;
alter table public.assistance_request_notes enable row level security;
alter table public.assistance_status_history enable row level security;
alter table public.assistance_followups enable row level security;

revoke all on public.assistance_requests, public.assistance_request_notes, public.assistance_status_history,
  public.assistance_followups from anon, authenticated;

grant select on public.assistance_requests to authenticated;
grant select, insert on public.assistance_request_notes to authenticated;
grant select on public.assistance_status_history to authenticated;
grant select on public.assistance_followups to authenticated;

create policy "Reviewers read requests"
  on public.assistance_requests for select to authenticated
  using ((select private.has_any_role(array['admin', 'assistance_reviewer']::public.app_role[])));

create policy "Reviewers read notes"
  on public.assistance_request_notes for select to authenticated
  using ((select private.has_any_role(array['admin', 'assistance_reviewer']::public.app_role[])));

create policy "Reviewers add notes"
  on public.assistance_request_notes for insert to authenticated
  with check (
    (select private.has_any_role(array['admin', 'assistance_reviewer']::public.app_role[]))
    and author_id = (select auth.uid())
    and exists (
      select 1 from public.assistance_requests r where r.id = request_id and r.redacted_at is null
    )
  );

create policy "Reviewers read status history"
  on public.assistance_status_history for select to authenticated
  using ((select private.has_any_role(array['admin', 'assistance_reviewer']::public.app_role[])));

create policy "Reviewers read follow-ups"
  on public.assistance_followups for select to authenticated
  using ((select private.has_any_role(array['admin', 'assistance_reviewer']::public.app_role[])));

create trigger assistance_requests_audit
  after insert or update or delete on public.assistance_requests
  for each row execute function private.audit_row_change(
    'fields', 'reference_code,status,category,urgency,source,assigned_reviewer_id,has_unread_followup,redacted_at'
  );
create trigger assistance_request_notes_audit
  after insert or update or delete on public.assistance_request_notes
  for each row execute function private.audit_row_change('fields', 'request_id,author_id');
create trigger assistance_followups_audit
  after insert or update or delete on public.assistance_followups
  for each row execute function private.audit_row_change('fields', 'request_id,read_at');

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Reference like PRY-K7Q2-M9XD. 32-symbol alphabet (no 0/O/1/I) → 40 bits.
create function private.generate_reference_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(8);
  v_code text := '';
begin
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    if i = 3 then
      v_code := v_code || '-';
    end if;
  end loop;
  return 'PRY-' || v_code;
end;
$$;

create function private.normalize_reference(p_reference text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_reference, ''), '\s', '', 'g'));
$$;

create function private.assistance_transition_allowed(
  p_from public.assistance_status,
  p_to public.assistance_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_from
    when 'pending' then p_to in ('under_review', 'more_information_required', 'declined')
    when 'under_review' then p_to in ('more_information_required', 'approved', 'declined')
    when 'more_information_required' then p_to in ('under_review', 'declined')
    when 'approved' then p_to in ('assistance_provided', 'under_review', 'declined')
    when 'declined' then p_to in ('under_review')
    when 'assistance_provided' then false
  end;
$$;
grant execute on function private.assistance_transition_allowed(public.assistance_status, public.assistance_status)
  to authenticated, service_role;

-- Validates and normalises request fields; raises on the first invalid field.
create function private.validate_assistance_input(
  p_applicant_name text,
  p_phone text,
  p_email text,
  p_village_id uuid,
  p_locality text,
  p_description text
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_phone text := private.normalize_phone(p_phone);
  v_email text := nullif(lower(btrim(p_email)), '');
  v_locality text := nullif(btrim(p_locality), '');
begin
  if char_length(btrim(coalesce(p_applicant_name, ''))) not between 2 and 120 then
    perform private.fail('invalid:applicant_name', 'Enter the applicant''s name (2–120 characters).', '22023');
  end if;
  if v_phone is null then
    perform private.fail('invalid:phone', 'Enter a valid phone number.', '22023');
  end if;
  if v_email is not null and not private.is_valid_email(v_email) then
    perform private.fail('invalid:email', 'Enter a valid email address or leave it empty.', '22023');
  end if;
  if p_village_id is not null and not exists (select 1 from public.villages where id = p_village_id) then
    perform private.fail('invalid:village_id', 'Choose a village from the list or enter your locality.', '22023');
  end if;
  if p_village_id is null and char_length(coalesce(v_locality, '')) < 2 then
    perform private.fail('invalid:locality', 'Choose a village or enter your village/locality.', '22023');
  end if;
  if char_length(coalesce(v_locality, '')) > 160 then
    perform private.fail('invalid:locality', 'Locality must be 160 characters or fewer.', '22023');
  end if;
  if char_length(btrim(coalesce(p_description, ''))) not between 20 and 3000 then
    perform private.fail('invalid:description', 'Describe the situation in 20–3000 characters.', '22023');
  end if;
  return jsonb_build_object('phone', v_phone, 'email', v_email, 'locality', v_locality);
end;
$$;

create function private.insert_assistance_request(
  p_category public.assistance_category,
  p_urgency public.assistance_urgency,
  p_applicant_name text,
  p_phone text,
  p_email text,
  p_village_id uuid,
  p_locality text,
  p_description text,
  p_relationship public.requester_relationship,
  p_preferred_contact public.contact_method,
  p_source public.request_source,
  p_client_submission_id uuid,
  p_history_reason text
)
returns public.assistance_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.assistance_requests;
  v_attempt integer := 0;
begin
  loop
    begin
      insert into public.assistance_requests (
        reference_code, category, urgency, applicant_name, phone, email, village_id, locality,
        description, requester_relationship, preferred_contact, consent_at, source, recorded_by,
        client_submission_id
      ) values (
        private.generate_reference_code(), p_category, coalesce(p_urgency, 'standard'), btrim(p_applicant_name),
        p_phone, p_email, p_village_id, p_locality, btrim(p_description), coalesce(p_relationship, 'self'),
        coalesce(p_preferred_contact, 'phone_call'), now(), p_source,
        case when p_source = 'staff_entry' then (select auth.uid()) end,
        p_client_submission_id
      )
      returning * into v_row;
      exit;
    exception when unique_violation then
      -- Retry only on a reference collision; re-raise anything else.
      if sqlerrm not like '%reference_code%' then
        raise;
      end if;
      v_attempt := v_attempt + 1;
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.assistance_status_history (request_id, from_status, to_status, changed_by, reason)
  values (v_row.id, null, 'pending', (select auth.uid()), p_history_reason);

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- Public submission (service role only)
-- -----------------------------------------------------------------------------
create function public.submit_assistance_request(
  p_category public.assistance_category,
  p_urgency public.assistance_urgency,
  p_applicant_name text,
  p_phone text,
  p_email text,
  p_village_id uuid,
  p_locality text,
  p_description text,
  p_relationship public.requester_relationship,
  p_preferred_contact public.contact_method,
  p_consent boolean,
  p_client_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean jsonb;
  v_existing public.assistance_requests;
  v_row public.assistance_requests;
begin
  if p_consent is not true then
    perform private.fail('invalid:consent', 'Consent is required so that we can review your request.', '22023');
  end if;
  if p_category is null then
    perform private.fail('invalid:category', 'Choose the type of assistance needed.', '22023');
  end if;

  v_clean := private.validate_assistance_input(
    p_applicant_name, p_phone, p_email, p_village_id, p_locality, p_description
  );

  -- Idempotent replay of the same submission (e.g. double-click / retry).
  if p_client_submission_id is not null then
    select * into v_existing from public.assistance_requests where client_submission_id = p_client_submission_id;
    if found then
      if v_existing.phone = v_clean ->> 'phone' then
        return jsonb_build_object('result', 'replayed', 'reference_code', v_existing.reference_code);
      end if;
      perform private.fail('submission_conflict', 'This submission could not be processed. Please reload the form.');
    end if;
  end if;

  -- One open request per phone number and category. The existing reference is
  -- deliberately not returned (someone else may know the phone number).
  if exists (
    select 1 from public.assistance_requests
    where phone = v_clean ->> 'phone'
      and category = p_category
      and redacted_at is null
      and status not in ('declined', 'assistance_provided')
      and created_at > now() - interval '90 days'
  ) then
    return jsonb_build_object('result', 'duplicate_open_request');
  end if;

  v_row := private.insert_assistance_request(
    p_category, p_urgency, p_applicant_name, v_clean ->> 'phone', v_clean ->> 'email', p_village_id,
    v_clean ->> 'locality', p_description, p_relationship, p_preferred_contact, 'web_form',
    p_client_submission_id, 'Submitted through the website.'
  );

  return jsonb_build_object('result', 'created', 'reference_code', v_row.reference_code);
end;
$$;

-- Status lookup for applicants. Returns only coarse information.
create function public.assistance_status_lookup(p_reference_code text, p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.assistance_requests;
begin
  select * into v
  from public.assistance_requests
  where reference_code = private.normalize_reference(p_reference_code)
    and phone = private.normalize_phone(p_phone)
    and redacted_at is null;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found', true,
    'reference_code', v.reference_code,
    'status', v.status,
    'category', v.category,
    'submitted_on', (v.created_at at time zone 'Asia/Kolkata')::date,
    'last_updated', (v.status_changed_at at time zone 'Asia/Kolkata')::date,
    'applicant_message', v.applicant_message,
    'can_follow_up', v.status = 'more_information_required'
      and (select count(*) from public.assistance_followups f where f.request_id = v.id) < 10
  );
end;
$$;

-- Resolves the request an applicant may add information to.
create function public.assistance_followup_target(p_reference_code text, p_phone text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.assistance_requests r
  where r.reference_code = private.normalize_reference(p_reference_code)
    and r.phone = private.normalize_phone(p_phone)
    and r.redacted_at is null
    and r.status = 'more_information_required'
    and (select count(*) from public.assistance_followups f where f.request_id = r.id) < 10;
$$;

create function public.assistance_add_followup(
  p_request_id uuid,
  p_message text,
  p_attachment_path text default null,
  p_attachment_name text default null,
  p_attachment_mime text default null,
  p_attachment_size integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.assistance_requests;
begin
  select * into v from public.assistance_requests where id = p_request_id for update;
  if not found or v.redacted_at is not null or v.status <> 'more_information_required' then
    perform private.fail('followup_not_allowed', 'This request is not waiting for more information.');
  end if;
  if char_length(btrim(coalesce(p_message, ''))) not between 1 and 2000 then
    perform private.fail('invalid:message', 'Enter a message of up to 2000 characters.', '22023');
  end if;

  insert into public.assistance_followups (
    request_id, message, attachment_path, attachment_name, attachment_mime, attachment_size
  ) values (
    p_request_id, btrim(p_message), p_attachment_path, p_attachment_name, p_attachment_mime, p_attachment_size
  );

  update public.assistance_requests
  set status = 'under_review',
      status_changed_at = now(),
      has_unread_followup = true
  where id = p_request_id;

  insert into public.assistance_status_history (request_id, from_status, to_status, changed_by, reason)
  values (p_request_id, 'more_information_required', 'under_review', null, 'Applicant provided more information.');

  return jsonb_build_object('result', 'received');
end;
$$;

-- -----------------------------------------------------------------------------
-- Reviewer workflow
-- -----------------------------------------------------------------------------
create function public.assistance_change_status(
  p_request_id uuid,
  p_new_status public.assistance_status,
  p_reason text default null,
  p_applicant_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.assistance_requests;
  v_reason text := nullif(btrim(p_reason), '');
  v_message text := nullif(btrim(p_applicant_message), '');
begin
  perform private.require_role(array['admin', 'assistance_reviewer']::public.app_role[]);

  select * into v from public.assistance_requests where id = p_request_id for update;
  if not found then
    perform private.fail('not_found', 'Request not found.');
  end if;
  if v.redacted_at is not null then
    perform private.fail('redacted', 'This request has been redacted and can no longer be changed.');
  end if;
  if not private.assistance_transition_allowed(v.status, p_new_status) then
    perform private.fail(
      'invalid_transition',
      format('A request cannot move from "%s" to "%s".', replace(v.status::text, '_', ' '), replace(p_new_status::text, '_', ' '))
    );
  end if;
  if p_new_status in ('declined', 'more_information_required') and v_reason is null then
    perform private.fail('reason_required', 'Record the reason for this decision in the internal note.');
  end if;
  if p_new_status = 'more_information_required' and v_message is null then
    perform private.fail('applicant_message_required', 'Tell the applicant what information is needed.');
  end if;
  if char_length(coalesce(v_message, '')) > 600 then
    perform private.fail('invalid:applicant_message', 'The message to the applicant must be 600 characters or fewer.', '22023');
  end if;

  update public.assistance_requests
  set status = p_new_status,
      status_changed_at = now(),
      closed_at = case when p_new_status in ('declined', 'assistance_provided') then now() end,
      applicant_message = coalesce(v_message, case when p_new_status = 'more_information_required' then applicant_message else null end),
      assigned_reviewer_id = coalesce(assigned_reviewer_id, (select auth.uid()))
  where id = p_request_id;

  insert into public.assistance_status_history (request_id, from_status, to_status, changed_by, reason)
  values (p_request_id, v.status, p_new_status, (select auth.uid()), v_reason);
end;
$$;

create function public.assistance_assign(p_request_id uuid, p_reviewer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(array['admin', 'assistance_reviewer']::public.app_role[]);

  if p_reviewer_id is not null and not exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = p_reviewer_id
      and ur.role in ('admin', 'assistance_reviewer')
      and p.is_active
  ) then
    perform private.fail('invalid_reviewer', 'Choose an active assistance reviewer.');
  end if;

  update public.assistance_requests
  set assigned_reviewer_id = p_reviewer_id
  where id = p_request_id and redacted_at is null;
  if not found then
    perform private.fail('not_found', 'Request not found.');
  end if;
end;
$$;

create function public.assistance_set_applicant_message(p_request_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(array['admin', 'assistance_reviewer']::public.app_role[]);
  if char_length(coalesce(p_message, '')) > 600 then
    perform private.fail('invalid:applicant_message', 'The message to the applicant must be 600 characters or fewer.', '22023');
  end if;
  update public.assistance_requests
  set applicant_message = nullif(btrim(p_message), '')
  where id = p_request_id and redacted_at is null;
  if not found then
    perform private.fail('not_found', 'Request not found.');
  end if;
end;
$$;

create function public.assistance_mark_followups_read(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(array['admin', 'assistance_reviewer']::public.app_role[]);
  update public.assistance_followups
  set read_at = now(), read_by = (select auth.uid())
  where request_id = p_request_id and read_at is null;
  update public.assistance_requests set has_unread_followup = false where id = p_request_id;
end;
$$;

-- Requests received by phone or in person, recorded by staff.
create function public.assistance_create_staff_entry(
  p_category public.assistance_category,
  p_urgency public.assistance_urgency,
  p_applicant_name text,
  p_phone text,
  p_email text,
  p_village_id uuid,
  p_locality text,
  p_description text,
  p_relationship public.requester_relationship,
  p_preferred_contact public.contact_method,
  p_consent_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean jsonb;
  v_existing text;
  v_row public.assistance_requests;
begin
  perform private.require_role(array['admin', 'assistance_reviewer']::public.app_role[]);
  if p_consent_confirmed is not true then
    perform private.fail('invalid:consent', 'Confirm that the applicant agreed to their information being recorded.', '22023');
  end if;
  v_clean := private.validate_assistance_input(
    p_applicant_name, p_phone, p_email, p_village_id, p_locality, p_description
  );

  select reference_code into v_existing
  from public.assistance_requests
  where phone = v_clean ->> 'phone' and category = p_category and redacted_at is null
    and status not in ('declined', 'assistance_provided')
  order by created_at desc
  limit 1;
  if v_existing is not null then
    return jsonb_build_object('result', 'duplicate_open_request', 'existing_reference', v_existing);
  end if;

  v_row := private.insert_assistance_request(
    p_category, p_urgency, p_applicant_name, v_clean ->> 'phone', v_clean ->> 'email', p_village_id,
    v_clean ->> 'locality', p_description, p_relationship, p_preferred_contact, 'staff_entry', null,
    'Recorded by staff.'
  );
  return jsonb_build_object('result', 'created', 'reference_code', v_row.reference_code, 'id', v_row.id);
end;
$$;

-- Removes personal data from a closed request, keeping only non-identifying
-- fields for statistics. Returns attachment paths that the caller (staff-api)
-- must delete from storage.
create function public.assistance_redact(p_request_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.assistance_requests;
  v_paths text[];
begin
  perform private.require_role(array['admin']::public.app_role[]);
  select * into v from public.assistance_requests where id = p_request_id for update;
  if not found then
    perform private.fail('not_found', 'Request not found.');
  end if;
  if v.redacted_at is not null then
    perform private.fail('already_redacted', 'This request has already been redacted.');
  end if;
  if v.status not in ('declined', 'assistance_provided') then
    perform private.fail('not_closed', 'Only closed requests (declined or assistance provided) can be redacted.');
  end if;

  select coalesce(array_agg(attachment_path), '{}') into v_paths
  from public.assistance_followups
  where request_id = p_request_id and attachment_path is not null;

  update public.assistance_requests
  set applicant_name = null,
      phone = null,
      email = null,
      locality = null,
      description = '[redacted]',
      applicant_message = null,
      client_submission_id = null,
      redacted_at = now(),
      redacted_by = (select auth.uid())
  where id = p_request_id;

  update public.assistance_request_notes set body = '[redacted]' where request_id = p_request_id;
  update public.assistance_status_history set reason = null where request_id = p_request_id;
  update public.assistance_followups
  set message = '[redacted]', attachment_path = null, attachment_name = null, attachment_mime = null,
      attachment_size = null
  where request_id = p_request_id;

  return v_paths;
end;
$$;

-- Privileges for the functions above.
revoke all on function public.submit_assistance_request(
  public.assistance_category, public.assistance_urgency, text, text, text, uuid, text, text,
  public.requester_relationship, public.contact_method, boolean, uuid
) from public, anon, authenticated;
revoke all on function public.assistance_status_lookup(text, text) from public, anon, authenticated;
revoke all on function public.assistance_followup_target(text, text) from public, anon, authenticated;
revoke all on function public.assistance_add_followup(uuid, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.assistance_change_status(uuid, public.assistance_status, text, text) from public, anon, authenticated;
revoke all on function public.assistance_assign(uuid, uuid) from public, anon, authenticated;
revoke all on function public.assistance_set_applicant_message(uuid, text) from public, anon, authenticated;
revoke all on function public.assistance_mark_followups_read(uuid) from public, anon, authenticated;
revoke all on function public.assistance_create_staff_entry(
  public.assistance_category, public.assistance_urgency, text, text, text, uuid, text, text,
  public.requester_relationship, public.contact_method, boolean
) from public, anon, authenticated;
revoke all on function public.assistance_redact(uuid) from public, anon, authenticated;

grant execute on function public.submit_assistance_request(
  public.assistance_category, public.assistance_urgency, text, text, text, uuid, text, text,
  public.requester_relationship, public.contact_method, boolean, uuid
) to service_role;
grant execute on function public.assistance_status_lookup(text, text) to service_role;
grant execute on function public.assistance_followup_target(text, text) to service_role;
grant execute on function public.assistance_add_followup(uuid, text, text, text, text, integer) to service_role;
grant execute on function public.assistance_change_status(uuid, public.assistance_status, text, text) to authenticated;
grant execute on function public.assistance_assign(uuid, uuid) to authenticated;
grant execute on function public.assistance_set_applicant_message(uuid, text) to authenticated;
grant execute on function public.assistance_mark_followups_read(uuid) to authenticated;
grant execute on function public.assistance_create_staff_entry(
  public.assistance_category, public.assistance_urgency, text, text, text, uuid, text, text,
  public.requester_relationship, public.contact_method, boolean
) to authenticated;
grant execute on function public.assistance_redact(uuid) to authenticated;

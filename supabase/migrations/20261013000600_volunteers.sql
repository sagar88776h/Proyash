-- =============================================================================
-- PRAYASH · 0600 · Volunteers and project assignments
--
--   * Registrations arrive through the public-api edge function (service role).
--   * Contact details are visible only to volunteer coordinators, admins and
--     the volunteer themself (once their account is linked).
--   * Nothing about volunteers is public. `consent_public_recognition` records
--     whether a volunteer agreed to be named publicly; only they can change it.
-- =============================================================================

create type public.volunteer_status as enum ('pending', 'approved', 'active', 'inactive', 'declined');
create type public.assignment_status as enum ('assigned', 'confirmed', 'completed', 'withdrawn');

create function private.volunteer_skill_options()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'teaching_tutoring', 'healthcare', 'first_aid', 'counselling', 'logistics', 'fundraising',
    'photography', 'social_media', 'writing_translation', 'accounting', 'event_management',
    'driving', 'cooking', 'construction_repair', 'technology', 'other'
  ];
$$;

create function private.volunteer_availability_options()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['weekday_mornings', 'weekday_evenings', 'weekends', 'school_holidays', 'emergencies', 'remote'];
$$;
grant execute on function private.volunteer_skill_options() to authenticated, service_role;
grant execute on function private.volunteer_availability_options() to authenticated, service_role;

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  phone text not null check (char_length(phone) <= 20),
  email text check (email is null or private.is_valid_email(email)),
  village_id uuid references public.villages (id) on delete set null,
  locality text check (char_length(locality) <= 160),
  is_adult boolean not null,
  guardian_name text check (char_length(guardian_name) <= 120),
  guardian_phone text check (char_length(guardian_phone) <= 20),
  skills text[] not null default '{}' check (skills <@ private.volunteer_skill_options() and cardinality(skills) <= 20),
  skills_other text check (char_length(skills_other) <= 200),
  availability text[] not null default '{}' check (availability <@ private.volunteer_availability_options()),
  preferred_activities public.activity_category[] not null default '{}',
  languages text check (char_length(languages) <= 200),
  motivation text check (char_length(motivation) <= 1000),
  consent_contact boolean not null check (consent_contact),
  consent_public_recognition boolean not null default false,
  status public.volunteer_status not null default 'pending',
  coordinator_notes text check (char_length(coordinator_notes) <= 4000),
  profile_id uuid unique references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  source public.request_source not null default 'web_form',
  client_submission_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteers_guardian check (is_adult or (guardian_name is not null and guardian_phone is not null)),
  constraint volunteers_location check (village_id is not null or char_length(btrim(locality)) >= 2)
);
comment on table public.volunteers is 'Private. Volunteer registrations and status.';
create index volunteers_status_idx on public.volunteers (status, created_at desc);
create index volunteers_phone_idx on public.volunteers (phone);

create table public.project_volunteers (
  project_id uuid not null references public.projects (id) on delete cascade,
  volunteer_id uuid not null references public.volunteers (id) on delete cascade,
  role_description text check (char_length(role_description) <= 200),
  status public.assignment_status not null default 'assigned',
  notes text check (char_length(notes) <= 1000),
  assigned_by uuid references public.profiles (id) on delete set null default auth.uid(),
  assigned_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (project_id, volunteer_id)
);
create index project_volunteers_volunteer_idx on public.project_volunteers (volunteer_id);

create trigger volunteers_set_updated_at before update on public.volunteers
  for each row execute function private.set_updated_at();
create trigger project_volunteers_set_updated_at before update on public.project_volunteers
  for each row execute function private.set_updated_at();

create function private.volunteer_track_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.status <> 'pending')
     or (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

create trigger volunteers_track_review
  before insert or update on public.volunteers
  for each row execute function private.volunteer_track_review();

create function private.guard_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and not exists (
    select 1 from public.volunteers v where v.id = new.volunteer_id and v.status in ('approved', 'active')
  ) then
    perform private.fail('volunteer_not_approved', 'Only approved or active volunteers can be assigned to projects.');
  end if;
  return new;
end;
$$;

create trigger project_volunteers_guard
  before insert on public.project_volunteers
  for each row execute function private.guard_assignment();

-- -----------------------------------------------------------------------------
-- Privileges and RLS
-- -----------------------------------------------------------------------------
alter table public.volunteers enable row level security;
alter table public.project_volunteers enable row level security;
revoke all on public.volunteers, public.project_volunteers from anon, authenticated;

grant select on public.volunteers to authenticated;
grant insert (full_name, phone, email, village_id, locality, is_adult, guardian_name, guardian_phone, skills,
              skills_other, availability, preferred_activities, languages, motivation, consent_contact,
              consent_public_recognition, status, coordinator_notes, source)
  on public.volunteers to authenticated;
grant update (status, coordinator_notes, skills, skills_other, availability, preferred_activities, village_id,
              locality, languages)
  on public.volunteers to authenticated;
grant select, insert, update, delete on public.project_volunteers to authenticated;

create policy "Coordinators read volunteers"
  on public.volunteers for select to authenticated
  using ((select private.has_any_role(array['admin', 'volunteer_coordinator']::public.app_role[])));

create policy "Volunteers read their own record"
  on public.volunteers for select to authenticated
  using (profile_id = (select auth.uid()));

create policy "Coordinators record volunteers"
  on public.volunteers for insert to authenticated
  with check (
    (select private.has_any_role(array['admin', 'volunteer_coordinator']::public.app_role[]))
    and source = 'staff_entry'
  );

create policy "Coordinators update volunteers"
  on public.volunteers for update to authenticated
  using ((select private.has_any_role(array['admin', 'volunteer_coordinator']::public.app_role[])))
  with check ((select private.has_any_role(array['admin', 'volunteer_coordinator']::public.app_role[])));

create policy "Coordinators manage assignments"
  on public.project_volunteers for all to authenticated
  using ((select private.has_any_role(array['admin', 'volunteer_coordinator']::public.app_role[])))
  with check ((select private.has_any_role(array['admin', 'volunteer_coordinator']::public.app_role[])));

create policy "Volunteers read their own assignments"
  on public.project_volunteers for select to authenticated
  using (
    exists (
      select 1 from public.volunteers v
      where v.id = volunteer_id and v.profile_id = (select auth.uid())
    )
  );

-- Volunteers with a linked account can read the (possibly unpublished) projects
-- they are assigned to.
create policy "Volunteers read assigned projects"
  on public.projects for select to authenticated
  using (
    exists (
      select 1
      from public.project_volunteers pv
      join public.volunteers v on v.id = pv.volunteer_id
      where pv.project_id = projects.id
        and pv.status <> 'withdrawn'
        and v.profile_id = (select auth.uid())
    )
  );

create trigger volunteers_audit
  after insert or update or delete on public.volunteers
  for each row execute function private.audit_row_change('fields', 'status,source,profile_id,consent_public_recognition');
create trigger project_volunteers_audit
  after insert or update or delete on public.project_volunteers
  for each row execute function private.audit_row_change('values', 'notes');

-- -----------------------------------------------------------------------------
-- Functions
-- -----------------------------------------------------------------------------
create function public.submit_volunteer_registration(
  p_full_name text,
  p_phone text,
  p_email text,
  p_village_id uuid,
  p_locality text,
  p_is_adult boolean,
  p_guardian_name text,
  p_guardian_phone text,
  p_skills text[],
  p_skills_other text,
  p_availability text[],
  p_preferred_activities public.activity_category[],
  p_languages text,
  p_motivation text,
  p_consent_contact boolean,
  p_consent_public_recognition boolean,
  p_client_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := private.normalize_phone(p_phone);
  v_guardian_phone text := private.normalize_phone(p_guardian_phone);
  v_email text := nullif(lower(btrim(p_email)), '');
  v_locality text := nullif(btrim(p_locality), '');
  v_existing public.volunteers;
begin
  if p_consent_contact is not true then
    perform private.fail('invalid:consent_contact', 'Please agree to be contacted about volunteering.', '22023');
  end if;
  if char_length(btrim(coalesce(p_full_name, ''))) not between 2 and 120 then
    perform private.fail('invalid:full_name', 'Enter your full name.', '22023');
  end if;
  if v_phone is null then
    perform private.fail('invalid:phone', 'Enter a valid phone number.', '22023');
  end if;
  if v_email is not null and not private.is_valid_email(v_email) then
    perform private.fail('invalid:email', 'Enter a valid email address or leave it empty.', '22023');
  end if;
  if p_is_adult is null then
    perform private.fail('invalid:is_adult', 'Tell us whether you are 18 or older.', '22023');
  end if;
  if not p_is_adult and (char_length(btrim(coalesce(p_guardian_name, ''))) < 2 or v_guardian_phone is null) then
    perform private.fail('invalid:guardian', 'Volunteers under 18 need a parent or guardian''s name and phone number.', '22023');
  end if;
  if p_village_id is null and char_length(coalesce(v_locality, '')) < 2 then
    perform private.fail('invalid:locality', 'Choose your village or enter your locality.', '22023');
  end if;
  if p_village_id is not null and not exists (select 1 from public.villages where id = p_village_id) then
    perform private.fail('invalid:village_id', 'Choose a village from the list.', '22023');
  end if;
  if not coalesce(p_skills, '{}') <@ private.volunteer_skill_options() then
    perform private.fail('invalid:skills', 'Choose skills from the list.', '22023');
  end if;
  if not coalesce(p_availability, '{}') <@ private.volunteer_availability_options() then
    perform private.fail('invalid:availability', 'Choose availability from the list.', '22023');
  end if;
  if cardinality(coalesce(p_availability, '{}')) = 0 then
    perform private.fail('invalid:availability', 'Choose at least one time when you are available.', '22023');
  end if;

  if p_client_submission_id is not null then
    select * into v_existing from public.volunteers where client_submission_id = p_client_submission_id;
    if found then
      return jsonb_build_object('result', 'replayed');
    end if;
  end if;

  if exists (
    select 1 from public.volunteers
    where phone = v_phone and status in ('pending', 'approved', 'active')
  ) then
    return jsonb_build_object('result', 'already_registered');
  end if;

  insert into public.volunteers (
    full_name, phone, email, village_id, locality, is_adult, guardian_name, guardian_phone, skills,
    skills_other, availability, preferred_activities, languages, motivation, consent_contact,
    consent_public_recognition, source, client_submission_id
  ) values (
    btrim(p_full_name), v_phone, v_email, p_village_id, v_locality, p_is_adult,
    case when p_is_adult then null else btrim(p_guardian_name) end,
    case when p_is_adult then null else v_guardian_phone end,
    coalesce(p_skills, '{}'), nullif(btrim(p_skills_other), ''), coalesce(p_availability, '{}'),
    coalesce(p_preferred_activities, '{}'), nullif(btrim(p_languages), ''), nullif(btrim(p_motivation), ''),
    true, coalesce(p_consent_public_recognition, false), 'web_form', p_client_submission_id
  );

  return jsonb_build_object('result', 'created');
end;
$$;

-- Self-service for a volunteer with a linked account.
create function public.update_my_volunteer_profile(
  p_availability text[],
  p_skills text[],
  p_skills_other text,
  p_preferred_activities public.activity_category[],
  p_languages text,
  p_consent_public_recognition boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    perform private.fail('not_authenticated', 'You must be signed in.', '42501');
  end if;
  if not coalesce(p_skills, '{}') <@ private.volunteer_skill_options()
     or not coalesce(p_availability, '{}') <@ private.volunteer_availability_options() then
    perform private.fail('invalid:skills', 'Choose options from the lists.', '22023');
  end if;
  update public.volunteers
  set availability = coalesce(p_availability, '{}'),
      skills = coalesce(p_skills, '{}'),
      skills_other = nullif(btrim(p_skills_other), ''),
      preferred_activities = coalesce(p_preferred_activities, '{}'),
      languages = nullif(btrim(p_languages), ''),
      consent_public_recognition = coalesce(p_consent_public_recognition, false)
  where profile_id = (select auth.uid());
  if not found then
    perform private.fail('not_found', 'No volunteer record is linked to your account.');
  end if;
end;
$$;

create function public.respond_to_assignment(p_project_id uuid, p_response public.assignment_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_response not in ('confirmed', 'withdrawn') then
    perform private.fail('invalid_response', 'You can confirm or withdraw from an assignment.');
  end if;
  update public.project_volunteers pv
  set status = p_response, responded_at = now()
  from public.volunteers v
  where pv.volunteer_id = v.id
    and v.profile_id = (select auth.uid())
    and pv.project_id = p_project_id
    and pv.status in ('assigned', 'confirmed');
  if not found then
    perform private.fail('not_found', 'Assignment not found or already closed.');
  end if;
end;
$$;

create function public.link_volunteer_account(p_volunteer_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(array['admin']::public.app_role[]);
  if p_profile_id is not null and not exists (select 1 from public.profiles where id = p_profile_id) then
    perform private.fail('not_found', 'User not found.');
  end if;
  update public.volunteers set profile_id = p_profile_id where id = p_volunteer_id;
  if not found then
    perform private.fail('not_found', 'Volunteer not found.');
  end if;
end;
$$;

revoke all on function public.submit_volunteer_registration(
  text, text, text, uuid, text, boolean, text, text, text[], text, text[], public.activity_category[], text, text,
  boolean, boolean, uuid
) from public, anon, authenticated;
revoke all on function public.update_my_volunteer_profile(text[], text[], text, public.activity_category[], text, boolean)
  from public, anon, authenticated;
revoke all on function public.respond_to_assignment(uuid, public.assignment_status) from public, anon, authenticated;
revoke all on function public.link_volunteer_account(uuid, uuid) from public, anon, authenticated;

grant execute on function public.submit_volunteer_registration(
  text, text, text, uuid, text, boolean, text, text, text[], text, text[], public.activity_category[], text, text,
  boolean, boolean, uuid
) to service_role;
grant execute on function public.update_my_volunteer_profile(text[], text[], text, public.activity_category[], text, boolean)
  to authenticated;
grant execute on function public.respond_to_assignment(uuid, public.assignment_status) to authenticated;
grant execute on function public.link_volunteer_account(uuid, uuid) to authenticated;

-- =============================================================================
-- PRAYASH · 0400 · Villages, projects, verified outcomes, media, budgets
--
-- Publication rules
--   * Only admins/publishers can publish or feature villages, projects and
--     outcomes, and only they can edit something once it is public.
--   * Volunteer coordinators may draft projects and upload field photos.
--   * A photo can only be published when it has alt text and its consent
--     status allows it (identifiable people require obtained consent). This is
--     enforced by a CHECK constraint, not just the UI.
--   * Approved images are copied to the public bucket by the staff-api edge
--     function; unapproved images never leave the private bucket.
-- =============================================================================

create type public.project_status as enum ('planned', 'ongoing', 'completed', 'on_hold', 'cancelled');
create type public.media_status as enum ('pending_review', 'published', 'rejected', 'archived');
create type public.consent_status as enum ('not_required', 'obtained', 'pending', 'refused');

-- True for trusted server-side callers with no end-user identity
-- (SQL editor / migrations as postgres, or the service role).
create function private.is_trusted_backend()
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select auth.uid()) is null
    and current_user in ('postgres', 'service_role', 'supabase_admin');
$$;
grant execute on function private.is_trusted_backend() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Villages
-- -----------------------------------------------------------------------------
create table public.villages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  local_name text check (char_length(local_name) <= 120),
  block text check (char_length(block) <= 120),
  district text check (char_length(district) <= 120),
  state text check (char_length(state) <= 120),
  summary text check (char_length(summary) <= 300),
  description text not null default '' check (char_length(description) <= 10000),
  cover_media_id uuid,
  is_published boolean not null default false,
  published_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index villages_published_idx on public.villages (is_published, sort_order, name);

-- -----------------------------------------------------------------------------
-- Projects
-- -----------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  summary text not null check (char_length(btrim(summary)) between 10 and 300),
  description text not null default '' check (char_length(description) <= 20000),
  village_id uuid references public.villages (id) on delete restrict,
  locality text check (char_length(locality) <= 160),
  category public.activity_category not null,
  status public.project_status not null default 'planned',
  start_date date,
  end_date date,
  cover_media_id uuid,
  is_published boolean not null default false,
  is_featured boolean not null default false,
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_dates_order check (end_date is null or start_date is null or end_date >= start_date),
  constraint projects_completion_date check (status <> 'completed' or end_date is not null),
  constraint projects_featured_published check (not is_featured or is_published)
);
create index projects_public_idx on public.projects (is_published, status, start_date desc);
create index projects_village_idx on public.projects (village_id);
create index projects_category_idx on public.projects (category);

-- -----------------------------------------------------------------------------
-- Verified outcomes
-- -----------------------------------------------------------------------------
create table public.project_outcomes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 3 and 200),
  quantity numeric(14, 2) check (quantity >= 0),
  unit text check (char_length(unit) <= 40),
  description text check (char_length(description) <= 1000),
  outcome_date date,
  is_verified boolean not null default false,
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  verification_note text check (char_length(verification_note) <= 1000),
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outcomes_verified_fields check (is_verified = (verified_at is not null)),
  constraint outcomes_featured_verified check (not is_featured or is_verified)
);
comment on column public.project_outcomes.verification_note is 'Internal: how the outcome was verified (never public).';
create index project_outcomes_project_idx on public.project_outcomes (project_id, sort_order);

-- -----------------------------------------------------------------------------
-- Media library
-- -----------------------------------------------------------------------------
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  private_path text not null unique check (char_length(private_path) <= 300),
  public_path text unique check (char_length(public_path) <= 300),
  mime_type text not null check (mime_type in ('image/webp', 'image/jpeg', 'image/png')),
  width integer check (width > 0),
  height integer check (height > 0),
  byte_size integer check (byte_size > 0 and byte_size <= 10485760),
  alt_text text not null default '' check (char_length(alt_text) <= 300),
  caption text check (char_length(caption) <= 300),
  credit text check (char_length(credit) <= 120),
  project_id uuid references public.projects (id) on delete set null,
  village_id uuid references public.villages (id) on delete set null,
  shows_identifiable_people boolean,
  consent_status public.consent_status not null default 'pending',
  consent_notes text check (char_length(consent_notes) <= 1000),
  status public.media_status not null default 'pending_review',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_public_path_iff_published check ((status = 'published') = (public_path is not null)),
  constraint media_publishable check (
    status <> 'published' or (
      char_length(btrim(alt_text)) >= 3
      and shows_identifiable_people is not null
      and (
        (shows_identifiable_people and consent_status = 'obtained')
        or (not shows_identifiable_people and consent_status in ('not_required', 'obtained'))
      )
    )
  )
);
comment on column public.media_assets.consent_notes is 'Internal: where the signed consent record is kept. Never public.';
create index media_assets_status_idx on public.media_assets (status, created_at desc);
create index media_assets_project_idx on public.media_assets (project_id);
create index media_assets_village_idx on public.media_assets (village_id);

alter table public.villages
  add constraint villages_cover_media_fk foreign key (cover_media_id) references public.media_assets (id) on delete set null;
alter table public.projects
  add constraint projects_cover_media_fk foreign key (cover_media_id) references public.media_assets (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Approved project budgets (finance-owned; public only when opted in)
-- -----------------------------------------------------------------------------
create table public.project_budgets (
  project_id uuid primary key references public.projects (id) on delete cascade,
  approved_budget numeric(14, 2) not null check (approved_budget >= 0 and approved_budget <= 100000000),
  approved_on date not null,
  approval_reference text check (char_length(approval_reference) <= 200),
  show_publicly boolean not null default false,
  recorded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Triggers: timestamps, publication guards
-- -----------------------------------------------------------------------------
create trigger villages_set_updated_at before update on public.villages
  for each row execute function private.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
  for each row execute function private.set_updated_at();
create trigger project_outcomes_set_updated_at before update on public.project_outcomes
  for each row execute function private.set_updated_at();
create trigger media_assets_set_updated_at before update on public.media_assets
  for each row execute function private.set_updated_at();
create trigger project_budgets_set_updated_at before update on public.project_budgets
  for each row execute function private.set_updated_at();

create function private.require_publisher_for(p_what text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.is_trusted_backend()
     and not private.has_any_role(array['admin', 'publisher']::public.app_role[]) then
    perform private.fail('publisher_required', format('Only authorised publishers can %s.', p_what), '42501');
  end if;
end;
$$;
grant execute on function private.require_publisher_for(text) to authenticated, service_role;

create function private.guard_village_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.is_published then
    perform private.require_publisher_for('edit a published village');
  end if;
  if new.is_published and (tg_op = 'INSERT' or not old.is_published) then
    perform private.require_publisher_for('publish villages');
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger villages_guard_publication
  before insert or update on public.villages
  for each row execute function private.guard_village_publication();

create function private.guard_project_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.is_published then
    perform private.require_publisher_for('edit a published project');
  end if;

  if not new.is_published then
    new.is_featured := false;
  end if;

  if new.is_published and (tg_op = 'INSERT' or not old.is_published) then
    perform private.require_publisher_for('publish projects');
    new.published_at := now();
    new.published_by := (select auth.uid());
  end if;

  if new.is_featured and (tg_op = 'INSERT' or not old.is_featured) then
    perform private.require_publisher_for('feature projects');
  end if;

  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger projects_guard_publication
  before insert or update on public.projects
  for each row execute function private.guard_project_publication();

create function private.guard_outcome_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.is_verified then
    perform private.require_publisher_for('edit a verified outcome');
  end if;

  if not new.is_verified then
    new.is_featured := false;
    new.verified_by := null;
    new.verified_at := null;
  elsif tg_op = 'INSERT' or not old.is_verified then
    perform private.require_publisher_for('verify outcomes');
    new.verified_by := (select auth.uid());
    new.verified_at := now();
  end if;

  if new.is_featured and (tg_op = 'INSERT' or not old.is_featured) then
    perform private.require_publisher_for('feature outcomes');
  end if;
  return new;
end;
$$;

create trigger project_outcomes_guard_verification
  before insert or update on public.project_outcomes
  for each row execute function private.guard_outcome_verification();

-- Status and public_path change only through the publish/unpublish RPCs
-- (SECURITY DEFINER functions owned by postgres) or trusted backends.
create function private.guard_media_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'pending_review' or new.public_path is not null then
      perform private.fail('invalid_media_state', 'New media must start in review.', '42501');
    end if;
  elsif new.status is distinct from old.status or new.public_path is distinct from old.public_path then
    perform private.fail('use_publish_workflow', 'Use the publish workflow to change a photo''s status.', '42501');
  end if;
  return new;
end;
$$;

create trigger media_assets_guard_status
  before insert or update on public.media_assets
  for each row execute function private.guard_media_status();

-- -----------------------------------------------------------------------------
-- Privileges and RLS
-- -----------------------------------------------------------------------------
alter table public.villages enable row level security;
alter table public.projects enable row level security;
alter table public.project_outcomes enable row level security;
alter table public.media_assets enable row level security;
alter table public.project_budgets enable row level security;

revoke all on public.villages, public.projects, public.project_outcomes, public.media_assets, public.project_budgets
  from anon, authenticated;

-- Anonymous visitors: public columns of published rows only.
grant select (id, slug, name, local_name, block, district, state, summary, description, cover_media_id,
              is_published, published_at, sort_order)
  on public.villages to anon;
grant select (id, slug, title, summary, description, village_id, locality, category, status, start_date,
              end_date, cover_media_id, is_published, is_featured, published_at)
  on public.projects to anon;
grant select (id, project_id, label, quantity, unit, description, outcome_date, is_verified, is_featured,
              sort_order)
  on public.project_outcomes to anon;
grant select (id, public_path, width, height, alt_text, caption, credit, project_id, village_id, status,
              sort_order)
  on public.media_assets to anon;

-- Signed-in users: full rows, filtered by RLS.
grant select, insert, update, delete on public.villages to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_outcomes to authenticated;
grant select, insert, delete on public.media_assets to authenticated;
grant update (alt_text, caption, credit, project_id, village_id, shows_identifiable_people, consent_status,
              consent_notes, sort_order)
  on public.media_assets to authenticated;
grant select, insert, update, delete on public.project_budgets to authenticated;

-- Villages
create policy "Public reads published villages"
  on public.villages for select to anon, authenticated
  using (is_published);
create policy "Staff read all villages"
  on public.villages for select to authenticated
  using ((select private.is_staff()));
create policy "Publishers create villages"
  on public.villages for insert to authenticated
  with check ((select private.has_any_role(array['admin', 'publisher']::public.app_role[])));
create policy "Publishers update villages"
  on public.villages for update to authenticated
  using ((select private.has_any_role(array['admin', 'publisher']::public.app_role[])))
  with check ((select private.has_any_role(array['admin', 'publisher']::public.app_role[])));
create policy "Admins delete unpublished villages"
  on public.villages for delete to authenticated
  using ((select private.has_role('admin')) and not is_published);

-- Projects
create policy "Public reads published projects"
  on public.projects for select to anon, authenticated
  using (is_published);
create policy "Staff read all projects"
  on public.projects for select to authenticated
  using ((select private.is_staff()));
create policy "Project editors create drafts"
  on public.projects for insert to authenticated
  with check ((select private.has_any_role(array['admin', 'publisher', 'volunteer_coordinator']::public.app_role[])));
create policy "Project editors update projects"
  on public.projects for update to authenticated
  using ((select private.has_any_role(array['admin', 'publisher', 'volunteer_coordinator']::public.app_role[])))
  with check ((select private.has_any_role(array['admin', 'publisher', 'volunteer_coordinator']::public.app_role[])));
create policy "Admins delete unpublished projects"
  on public.projects for delete to authenticated
  using ((select private.has_role('admin')) and not is_published);

-- Outcomes
create policy "Public reads verified outcomes of published projects"
  on public.project_outcomes for select to anon, authenticated
  using (
    is_verified
    and exists (select 1 from public.projects p where p.id = project_id and p.is_published)
  );
create policy "Staff read all outcomes"
  on public.project_outcomes for select to authenticated
  using ((select private.is_staff()));
create policy "Project editors add outcomes"
  on public.project_outcomes for insert to authenticated
  with check ((select private.has_any_role(array['admin', 'publisher', 'volunteer_coordinator']::public.app_role[])));
create policy "Project editors update outcomes"
  on public.project_outcomes for update to authenticated
  using ((select private.has_any_role(array['admin', 'publisher', 'volunteer_coordinator']::public.app_role[])))
  with check ((select private.has_any_role(array['admin', 'publisher', 'volunteer_coordinator']::public.app_role[])));
create policy "Publishers delete outcomes"
  on public.project_outcomes for delete to authenticated
  using ((select private.has_any_role(array['admin', 'publisher']::public.app_role[])));

-- Media
create policy "Public reads published media"
  on public.media_assets for select to anon, authenticated
  using (status = 'published');
create policy "Media team reads library"
  on public.media_assets for select to authenticated
  using ((select private.has_any_role(array['admin', 'publisher', 'volunteer_coordinator']::public.app_role[])));
create policy "Media team uploads for review"
  on public.media_assets for insert to authenticated
  with check (
    (select private.has_any_role(array['admin', 'publisher', 'volunteer_coordinator']::public.app_role[]))
    and uploaded_by = (select auth.uid())
  );
create policy "Publishers edit media details"
  on public.media_assets for update to authenticated
  using ((select private.has_any_role(array['admin', 'publisher']::public.app_role[])))
  with check ((select private.has_any_role(array['admin', 'publisher']::public.app_role[])));
create policy "Publishers delete unpublished media"
  on public.media_assets for delete to authenticated
  using ((select private.has_any_role(array['admin', 'publisher']::public.app_role[])) and status <> 'published');

-- Budgets
create policy "Finance and publishers read budgets"
  on public.project_budgets for select to authenticated
  using ((select private.has_any_role(array['admin', 'treasurer', 'publisher']::public.app_role[])));
create policy "Finance records budgets"
  on public.project_budgets for insert to authenticated
  with check ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])));
create policy "Finance updates budgets"
  on public.project_budgets for update to authenticated
  using ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])))
  with check ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])));
create policy "Finance removes budgets"
  on public.project_budgets for delete to authenticated
  using ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])));

-- Audit
create trigger villages_audit after insert or update or delete on public.villages
  for each row execute function private.audit_row_change('values');
create trigger projects_audit after insert or update or delete on public.projects
  for each row execute function private.audit_row_change('values');
create trigger project_outcomes_audit after insert or update or delete on public.project_outcomes
  for each row execute function private.audit_row_change('values');
create trigger media_assets_audit after insert or update or delete on public.media_assets
  for each row execute function private.audit_row_change('values', 'consent_notes');
create trigger project_budgets_audit after insert or update or delete on public.project_budgets
  for each row execute function private.audit_row_change('values');

-- -----------------------------------------------------------------------------
-- Media publish workflow (called by the staff-api edge function with the
-- caller's JWT, so auth.uid() is the publisher and permissions apply).
-- -----------------------------------------------------------------------------
create function public.media_prepare_publish(p_media_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.media_assets;
begin
  perform private.require_role(array['admin', 'publisher']::public.app_role[]);
  select * into v from public.media_assets where id = p_media_id;
  if not found then
    perform private.fail('not_found', 'Photo not found.');
  end if;
  if v.status = 'published' then
    perform private.fail('already_published', 'This photo is already published.');
  end if;
  if char_length(btrim(v.alt_text)) < 3 then
    perform private.fail('alt_text_required', 'Add a short description (alt text) before publishing.');
  end if;
  if v.shows_identifiable_people is null then
    perform private.fail('people_assessment_required', 'Record whether identifiable people appear in this photo.');
  end if;
  if v.shows_identifiable_people and v.consent_status <> 'obtained' then
    perform private.fail('consent_required', 'Informed consent must be obtained before publishing a photo of identifiable people.');
  end if;
  if not v.shows_identifiable_people and v.consent_status not in ('not_required', 'obtained') then
    perform private.fail('consent_required', 'Consent status does not allow publishing.');
  end if;
  return jsonb_build_object('private_path', v.private_path, 'mime_type', v.mime_type);
end;
$$;

create function public.media_mark_published(p_media_id uuid, p_public_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.media_prepare_publish(p_media_id);
  if not exists (
    select 1 from storage.objects where bucket_id = 'media-public' and name = p_public_path
  ) then
    perform private.fail('public_copy_missing', 'The public copy of this photo was not found.');
  end if;
  update public.media_assets
  set status = 'published',
      public_path = p_public_path,
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = p_media_id;
end;
$$;

create function public.media_prepare_unpublish(p_media_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  perform private.require_role(array['admin', 'publisher']::public.app_role[]);
  select public_path into v_path from public.media_assets where id = p_media_id and status = 'published';
  if v_path is null then
    perform private.fail('not_published', 'This photo is not published.');
  end if;
  return v_path;
end;
$$;

-- Moves a photo out of publication (archived) or rejects one under review.
create function public.media_set_unpublished(p_media_id uuid, p_status public.media_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(array['admin', 'publisher']::public.app_role[]);
  if p_status not in ('archived', 'rejected', 'pending_review') then
    perform private.fail('invalid_status', 'Choose archived, rejected or pending review.');
  end if;
  update public.media_assets
  set status = p_status,
      public_path = null,
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = p_media_id;
  if not found then
    perform private.fail('not_found', 'Photo not found.');
  end if;
end;
$$;

revoke all on function public.media_prepare_publish(uuid) from public, anon, authenticated;
revoke all on function public.media_mark_published(uuid, text) from public, anon, authenticated;
revoke all on function public.media_prepare_unpublish(uuid) from public, anon, authenticated;
revoke all on function public.media_set_unpublished(uuid, public.media_status) from public, anon, authenticated;
grant execute on function public.media_prepare_publish(uuid) to authenticated;
grant execute on function public.media_mark_published(uuid, text) to authenticated;
grant execute on function public.media_prepare_unpublish(uuid) to authenticated;
grant execute on function public.media_set_unpublished(uuid, public.media_status) to authenticated;

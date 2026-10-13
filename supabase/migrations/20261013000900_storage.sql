-- =============================================================================
-- PRAYASH · 0900 · Storage buckets and object policies
--
--   media-private     staff uploads awaiting review            private
--   media-public      approved, consented images only           public (CDN)
--   finance-evidence  bills, receipts, statements, screenshots  private
--   assistance-files  applicant follow-up documents             private
--   report-documents  redacted PDFs attached to reports         private; readable
--                                                               once the report
--                                                               is published
-- Writes to media-public and assistance-files happen only through edge
-- functions using the service role.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('media-private', 'media-private', false, 10485760, array['image/webp', 'image/jpeg', 'image/png']),
  ('media-public', 'media-public', true, 10485760, array['image/webp', 'image/jpeg', 'image/png']),
  ('finance-evidence', 'finance-evidence', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('assistance-files', 'assistance-files', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('report-documents', 'report-documents', false, 20971520, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- media-private ---------------------------------------------------------------
create policy "Media team reads private media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media-private'
    and (select private.has_any_role(array['admin', 'publisher', 'volunteer_coordinator']::public.app_role[]))
  );

create policy "Media team uploads private media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media-private'
    and (select private.has_any_role(array['admin', 'publisher', 'volunteer_coordinator']::public.app_role[]))
    and name ~ '^uploads/[0-9a-f-]{36}\.(webp|jpg|jpeg|png)$'
  );

create policy "Publishers delete private media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'media-private'
    and (select private.has_any_role(array['admin', 'publisher']::public.app_role[]))
  );

-- finance-evidence ------------------------------------------------------------
create policy "Finance reads evidence files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'finance-evidence'
    and (select private.has_any_role(array['admin', 'treasurer']::public.app_role[]))
  );

create policy "Finance uploads evidence files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'finance-evidence'
    and (select private.has_any_role(array['admin', 'treasurer']::public.app_role[]))
    and name ~ '^entries/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'
    and exists (
      select 1 from public.ledger_entries e
      where e.id = private.try_uuid((storage.foldername(name))[2])
    )
  );

create policy "Finance deletes evidence of pending entries"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'finance-evidence'
    and (select private.has_any_role(array['admin', 'treasurer']::public.app_role[]))
    and exists (
      select 1 from public.ledger_entries e
      where e.id = private.try_uuid((storage.foldername(name))[2]) and e.status = 'pending'
    )
  );

-- assistance-files ------------------------------------------------------------
create policy "Reviewers read assistance files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'assistance-files'
    and (select private.has_any_role(array['admin', 'assistance_reviewer']::public.app_role[]))
  );

-- report-documents ------------------------------------------------------------
create policy "Public reads documents of published reports"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'report-documents'
    and exists (
      select 1
      from public.financial_report_documents d
      join public.financial_reports r on r.id = d.report_id
      where d.storage_path = name and r.status = 'published'
    )
  );

create policy "Finance reads all report documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'report-documents'
    and (select private.has_any_role(array['admin', 'treasurer']::public.app_role[]))
  );

create policy "Finance uploads report documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-documents'
    and (select private.has_any_role(array['admin', 'treasurer']::public.app_role[]))
    and name ~ '^reports/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}\.pdf$'
    and exists (
      select 1 from public.financial_reports r
      where r.id = private.try_uuid((storage.foldername(name))[2]) and r.status = 'draft'
    )
  );

create policy "Finance deletes draft report documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'report-documents'
    and (select private.has_any_role(array['admin', 'treasurer']::public.app_role[]))
    and exists (
      select 1 from public.financial_reports r
      where r.id = private.try_uuid((storage.foldername(name))[2]) and r.status = 'draft'
    )
  );

-- =============================================================================
-- PRAYASH · 0700 · Financial ledger, verification, reconciliation, reports
--
-- Principles (docs/FINANCE.md):
--   * ledger_entries is the single source of truth. Every balance, summary
--     and report is computed from VERIFIED entries; there are no stored totals.
--   * Entries start as `pending`. A treasurer/admin verifies them manually
--     against bank statements, bills or receipts. Submitting a payment
--     screenshot never verifies anything.
--   * Verification is four-eyes by default: whoever recorded or last edited an
--     entry cannot verify it (setting finance.controls).
--   * Verified and rejected entries are immutable and nothing is ever deleted.
--     Mistakes are corrected with reversal entries (plus an optional
--     replacement entry), which keeps the full correction history.
--   * A balanced reconciliation closes the period for that account: entries
--     dated on or before the statement date can no longer be added/verified.
--   * Duplicate prevention: transaction references are unique per payment
--     method, and near-identical entries require explicit confirmation.
--   * Outflows and opening balances require supporting evidence to verify.
--   * Never store card numbers, UPI PINs, passwords or banking credentials.
-- =============================================================================

create type public.ledger_entry_type as enum (
  'opening_balance',
  'member_contribution',
  'public_donation',
  'other_income',
  'expense',
  'refund',
  'transfer',
  'allocation',
  'reversal'
);
create type public.ledger_direction as enum ('in', 'out', 'internal');
create type public.ledger_status as enum ('pending', 'verified', 'rejected');
create type public.payment_method as enum ('upi', 'bank_transfer', 'cash', 'cheque', 'other');
create type public.expense_category as enum (
  'education_support',
  'medical_support',
  'food_support',
  'essential_needs',
  'project_materials',
  'transport',
  'events',
  'administration',
  'bank_charges',
  'other'
);
create type public.account_type as enum ('bank', 'cash', 'digital_wallet');
create type public.entry_source as enum ('staff', 'public_report');
create type public.evidence_kind as enum ('payment_screenshot', 'receipt', 'bill', 'bank_statement', 'other');
create type public.report_status as enum ('draft', 'published', 'withdrawn');
create type public.report_period as enum ('monthly', 'quarterly', 'annual', 'custom');

-- -----------------------------------------------------------------------------
-- Accounts (where money is held). Do not store full account numbers here.
-- -----------------------------------------------------------------------------
create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 80),
  account_type public.account_type not null,
  description text check (char_length(description) <= 300),
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.financial_accounts.description is 'E.g. bank name and last four digits only. Never store full account numbers or credentials.';

create trigger financial_accounts_set_updated_at before update on public.financial_accounts
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Ledger entries
-- -----------------------------------------------------------------------------
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no bigint generated always as identity unique,
  entry_date date not null check (entry_date >= date '2000-01-01'),
  entry_type public.ledger_entry_type not null,
  direction public.ledger_direction not null,
  amount numeric(14, 2) not null check (amount > 0 and amount <= 100000000),
  account_id uuid references public.financial_accounts (id) on delete restrict,
  project_id uuid references public.projects (id) on delete restrict,
  expense_category public.expense_category,
  payment_method public.payment_method,
  transaction_reference text check (char_length(transaction_reference) <= 120),
  description text not null check (char_length(btrim(description)) between 3 and 500),
  status public.ledger_status not null default 'pending',
  source public.entry_source not null default 'staff',
  recorded_by uuid references public.profiles (id) on delete restrict,
  recorded_at timestamptz not null default now(),
  last_edited_by uuid references public.profiles (id) on delete restrict,
  last_edited_at timestamptz,
  verified_by uuid references public.profiles (id) on delete restrict,
  verified_at timestamptz,
  verification_note text check (char_length(verification_note) <= 500),
  rejected_by uuid references public.profiles (id) on delete restrict,
  rejected_at timestamptz,
  rejection_reason text check (char_length(rejection_reason) <= 500),
  reverses_entry_id uuid references public.ledger_entries (id) on delete restrict,
  replaces_entry_id uuid references public.ledger_entries (id) on delete restrict,
  related_entry_id uuid references public.ledger_entries (id) on delete restrict,
  transfer_group_id uuid,
  correction_reason text check (char_length(correction_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ledger_direction_matches_type check (
    case entry_type
      when 'opening_balance' then direction = 'in'
      when 'member_contribution' then direction = 'in'
      when 'public_donation' then direction = 'in'
      when 'other_income' then direction = 'in'
      when 'expense' then direction = 'out'
      when 'refund' then direction = 'out'
      when 'transfer' then direction in ('in', 'out')
      when 'allocation' then direction = 'internal'
      when 'reversal' then true
    end
  ),
  -- Cash entries need an account; a donor's own report may arrive without one
  -- and the treasurer assigns it while reviewing (verification requires it).
  constraint ledger_account_iff_cash check (
    (direction = 'internal' and account_id is null)
    or (direction <> 'internal' and (account_id is not null or (source = 'public_report' and status = 'pending')))
  ),
  constraint ledger_payment_method_iff_cash check ((direction = 'internal') = (payment_method is null)),
  constraint ledger_allocation_has_project check (entry_type <> 'allocation' or project_id is not null),
  constraint ledger_expense_has_category check (
    (entry_type = 'expense' and expense_category is not null)
    or (entry_type = 'reversal')
    or (entry_type not in ('expense', 'reversal') and expense_category is null)
  ),
  constraint ledger_reversal_link check ((entry_type = 'reversal') = (reverses_entry_id is not null)),
  constraint ledger_reversal_reason check (entry_type <> 'reversal' or correction_reason is not null),
  constraint ledger_transfer_group check ((entry_type = 'transfer') = (transfer_group_id is not null)),
  constraint ledger_refund_link check (entry_type <> 'refund' or related_entry_id is not null),
  constraint ledger_verified_fields check ((status = 'verified') = (verified_at is not null and verified_by is not null)),
  constraint ledger_rejected_fields check (
    (status = 'rejected') = (rejected_at is not null and rejected_by is not null and rejection_reason is not null)
  ),
  constraint ledger_staff_recorder check (source = 'public_report' or recorded_by is not null),
  constraint ledger_public_report_type check (source <> 'public_report' or entry_type = 'public_donation')
);
comment on table public.ledger_entries is 'Append-only transaction ledger. Balances are computed from verified entries only.';

create index ledger_entries_date_idx on public.ledger_entries (entry_date desc, entry_no desc);
create index ledger_entries_status_idx on public.ledger_entries (status, entry_date desc);
create index ledger_entries_account_idx on public.ledger_entries (account_id, entry_date);
create index ledger_entries_project_idx on public.ledger_entries (project_id) where project_id is not null;
create index ledger_entries_type_idx on public.ledger_entries (entry_type, entry_date);
create index ledger_entries_transfer_idx on public.ledger_entries (transfer_group_id) where transfer_group_id is not null;
create index ledger_entries_related_idx on public.ledger_entries (related_entry_id) where related_entry_id is not null;

-- At most one live (pending or verified) reversal per entry.
create unique index ledger_entries_one_live_reversal on public.ledger_entries (reverses_entry_id)
where reverses_entry_id is not null and status <> 'rejected';

-- Duplicate prevention: one live entry per payment reference (UTR/UPI ref/cheque no).
create unique index ledger_entries_unique_reference on public.ledger_entries (
  payment_method, upper(btrim(transaction_reference))
)
where transaction_reference is not null
  and btrim(transaction_reference) <> ''
  and status <> 'rejected'
  and entry_type not in ('transfer', 'reversal');

-- Donation details (1:1 with member_contribution / public_donation entries).
create table public.donations (
  ledger_entry_id uuid primary key references public.ledger_entries (id) on delete restrict,
  donor_name text check (char_length(donor_name) <= 120),
  donor_phone text check (char_length(donor_phone) <= 20),
  donor_email text check (donor_email is null or private.is_valid_email(donor_email)),
  is_anonymous boolean not null default false,
  acknowledge_publicly boolean not null default false,
  donor_message text check (char_length(donor_message) <= 500),
  receipt_number text unique,
  receipt_issued_at timestamptz,
  client_submission_id uuid unique,
  created_at timestamptz not null default now(),
  constraint donations_named_or_anonymous check (is_anonymous or char_length(btrim(donor_name)) >= 2),
  constraint donations_ack_requires_name check (not (is_anonymous and acknowledge_publicly)),
  constraint donations_receipt_fields check ((receipt_number is null) = (receipt_issued_at is null))
);

-- Expense details (1:1 with expense entries).
create table public.expenses (
  ledger_entry_id uuid primary key references public.ledger_entries (id) on delete restrict,
  payee_name text not null check (char_length(btrim(payee_name)) between 2 and 160),
  bill_reference text check (char_length(bill_reference) <= 120),
  assistance_request_id uuid references public.assistance_requests (id) on delete set null,
  created_at timestamptz not null default now()
);
create index expenses_assistance_idx on public.expenses (assistance_request_id) where assistance_request_id is not null;

-- Supporting evidence stored in the private `finance-evidence` bucket.
create table public.ledger_evidence (
  id uuid primary key default gen_random_uuid(),
  ledger_entry_id uuid not null references public.ledger_entries (id) on delete restrict,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  kind public.evidence_kind not null default 'other',
  uploaded_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index ledger_evidence_entry_idx on public.ledger_evidence (ledger_entry_id);

create table private.receipt_counters (
  financial_year text primary key,
  last_number integer not null default 0
);
alter table private.receipt_counters enable row level security;

create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.financial_accounts (id) on delete restrict,
  statement_date date not null,
  statement_balance numeric(14, 2) not null,
  computed_balance numeric(14, 2) not null,
  difference numeric(14, 2) generated always as (statement_balance - computed_balance) stored,
  pending_entries_count integer not null default 0,
  notes text check (char_length(notes) <= 1000),
  performed_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index reconciliations_account_idx on public.reconciliations (account_id, statement_date desc);

create table public.financial_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 5 and 160),
  period_type public.report_period not null,
  period_start date not null,
  period_end date not null,
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  narrative text not null default '' check (char_length(narrative) <= 20000),
  status public.report_status not null default 'draft',
  prepared_by uuid not null references public.profiles (id) on delete restrict,
  prepared_at timestamptz not null default now(),
  snapshot_generated_at timestamptz not null default now(),
  approved_by uuid references public.profiles (id) on delete restrict,
  published_at timestamptz,
  withdrawn_by uuid references public.profiles (id) on delete restrict,
  withdrawn_at timestamptz,
  withdrawal_reason text check (char_length(withdrawal_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_period_order check (period_end >= period_start),
  constraint reports_published_fields check (
    (status in ('published', 'withdrawn')) = (approved_by is not null and published_at is not null)
  ),
  constraint reports_withdrawn_fields check (
    (status = 'withdrawn') = (withdrawn_at is not null and withdrawn_by is not null and withdrawal_reason is not null)
  )
);
create index financial_reports_public_idx on public.financial_reports (status, period_end desc);

create table public.financial_report_documents (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.financial_reports (id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  storage_path text not null unique check (char_length(storage_path) <= 300),
  mime_type text not null check (mime_type = 'application/pdf'),
  byte_size integer not null check (byte_size > 0 and byte_size <= 20971520),
  redaction_confirmed boolean not null check (redaction_confirmed),
  uploaded_by uuid not null references public.profiles (id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now()
);
comment on column public.financial_report_documents.redaction_confirmed is 'Uploader confirms personal data (names, phone numbers, account numbers) has been removed.';
create index financial_report_documents_report_idx on public.financial_report_documents (report_id);

create trigger ledger_entries_set_updated_at before update on public.ledger_entries
  for each row execute function private.set_updated_at();
create trigger financial_reports_set_updated_at before update on public.financial_reports
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Integrity guards
-- -----------------------------------------------------------------------------
create function private.guard_ledger_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.fail('append_only', 'Ledger entries cannot be deleted. Reject or reverse them instead.', '42501');
  end if;
  if old.status in ('verified', 'rejected') then
    perform private.fail('immutable_entry', 'Verified and rejected entries cannot be changed. Record a reversal instead.', '42501');
  end if;
  if new.entry_type is distinct from old.entry_type
     or new.direction is distinct from old.direction
     or new.source is distinct from old.source
     or new.recorded_by is distinct from old.recorded_by
     or new.recorded_at is distinct from old.recorded_at
     or new.reverses_entry_id is distinct from old.reverses_entry_id
     or new.transfer_group_id is distinct from old.transfer_group_id
     or new.entry_no is distinct from old.entry_no then
    perform private.fail('immutable_field', 'The type, origin and links of a ledger entry cannot be changed.', '42501');
  end if;
  return new;
end;
$$;

create trigger ledger_entries_guard
  before update or delete on public.ledger_entries
  for each row execute function private.guard_ledger_entry();

create trigger ledger_entries_no_truncate
  before truncate on public.ledger_entries
  for each statement execute function private.prevent_modification();

create function private.guard_ledger_detail()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.ledger_status;
begin
  if tg_op = 'DELETE' then
    perform private.fail('append_only', 'Financial records cannot be deleted.', '42501');
  end if;
  select status into v_status from public.ledger_entries where id = old.ledger_entry_id;
  if v_status <> 'pending' then
    -- The only change allowed after verification is issuing a receipt number once.
    if tg_table_name = 'donations'
       and old.receipt_number is null
       and new.receipt_number is not null
       and (to_jsonb(new) - 'receipt_number' - 'receipt_issued_at') = (to_jsonb(old) - 'receipt_number' - 'receipt_issued_at') then
      return new;
    end if;
    perform private.fail('immutable_entry', 'Details of verified or rejected entries cannot be changed.', '42501');
  end if;
  if new.ledger_entry_id is distinct from old.ledger_entry_id then
    perform private.fail('immutable_field', 'Details cannot be moved to another entry.', '42501');
  end if;
  return new;
end;
$$;

create trigger donations_guard before update or delete on public.donations
  for each row execute function private.guard_ledger_detail();
create trigger expenses_guard before update or delete on public.expenses
  for each row execute function private.guard_ledger_detail();

create function private.guard_evidence_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    perform private.fail('append_only', 'Evidence records cannot be edited.', '42501');
  end if;
  if exists (select 1 from public.ledger_entries where id = old.ledger_entry_id and status <> 'pending') then
    perform private.fail('immutable_entry', 'Evidence for verified or rejected entries cannot be removed.', '42501');
  end if;
  return old;
end;
$$;

create trigger ledger_evidence_guard before update or delete on public.ledger_evidence
  for each row execute function private.guard_evidence_delete();

create trigger reconciliations_immutable before update or delete on public.reconciliations
  for each row execute function private.prevent_modification();

create function private.guard_financial_report()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      perform private.fail('immutable_report', 'Published reports cannot be deleted. Withdraw them instead.', '42501');
    end if;
    return old;
  end if;
  if old.status = 'withdrawn' then
    perform private.fail('immutable_report', 'Withdrawn reports cannot be changed.', '42501');
  end if;
  if old.status = 'published' then
    -- Only withdrawal is allowed once published.
    if new.status <> 'withdrawn'
       or (to_jsonb(new) - 'status' - 'withdrawn_by' - 'withdrawn_at' - 'withdrawal_reason' - 'updated_at')
          <> (to_jsonb(old) - 'status' - 'withdrawn_by' - 'withdrawn_at' - 'withdrawal_reason' - 'updated_at') then
      perform private.fail('immutable_report', 'A published report cannot be edited. Withdraw it and publish a corrected report.', '42501');
    end if;
  end if;
  return new;
end;
$$;

create trigger financial_reports_guard before update or delete on public.financial_reports
  for each row execute function private.guard_financial_report();

create function private.guard_report_document()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_report_id uuid := case when tg_op = 'DELETE' then old.report_id else new.report_id end;
begin
  if tg_op = 'UPDATE' then
    perform private.fail('append_only', 'Report documents cannot be edited; remove and upload again.', '42501');
  end if;
  if not exists (select 1 from public.financial_reports where id = v_report_id and status = 'draft') then
    perform private.fail('report_not_draft', 'Documents can only be changed while the report is a draft.', '42501');
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger financial_report_documents_guard before insert or update or delete on public.financial_report_documents
  for each row execute function private.guard_report_document();

-- -----------------------------------------------------------------------------
-- Privileges and RLS
-- -----------------------------------------------------------------------------
alter table public.financial_accounts enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.donations enable row level security;
alter table public.expenses enable row level security;
alter table public.ledger_evidence enable row level security;
alter table public.reconciliations enable row level security;
alter table public.financial_reports enable row level security;
alter table public.financial_report_documents enable row level security;

revoke all on public.financial_accounts, public.ledger_entries, public.donations, public.expenses,
  public.ledger_evidence, public.reconciliations, public.financial_reports, public.financial_report_documents
  from anon, authenticated;

grant select on public.financial_accounts to authenticated;
grant insert (name, account_type, description, is_active) on public.financial_accounts to authenticated;
grant update (name, account_type, description, is_active) on public.financial_accounts to authenticated;
grant select on public.ledger_entries, public.donations, public.expenses, public.reconciliations to authenticated;
grant select, insert, delete on public.ledger_evidence to authenticated;
grant select on public.financial_reports to authenticated;
grant select (id, title, period_type, period_start, period_end, summary, narrative, status, published_at)
  on public.financial_reports to anon;
grant select, insert, delete on public.financial_report_documents to authenticated;
grant select (id, report_id, title, storage_path, mime_type, byte_size, created_at)
  on public.financial_report_documents to anon;

create policy "Finance reads accounts" on public.financial_accounts for select to authenticated
  using ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])));
create policy "Finance creates accounts" on public.financial_accounts for insert to authenticated
  with check ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])));
create policy "Finance updates accounts" on public.financial_accounts for update to authenticated
  using ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])))
  with check ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])));

create policy "Finance reads ledger" on public.ledger_entries for select to authenticated
  using ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])));
create policy "Finance reads donations" on public.donations for select to authenticated
  using ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])));
create policy "Finance reads expenses" on public.expenses for select to authenticated
  using ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])));
create policy "Finance reads reconciliations" on public.reconciliations for select to authenticated
  using ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])));

create policy "Finance reads evidence" on public.ledger_evidence for select to authenticated
  using ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])));
create policy "Finance attaches evidence" on public.ledger_evidence for insert to authenticated
  with check (
    (select private.has_any_role(array['admin', 'treasurer']::public.app_role[]))
    and uploaded_by = (select auth.uid())
    and storage_path like 'entries/' || ledger_entry_id::text || '/%'
  );
create policy "Finance removes evidence from pending entries" on public.ledger_evidence for delete to authenticated
  using ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])));

create policy "Public reads published reports" on public.financial_reports for select to anon, authenticated
  using (status = 'published');
create policy "Finance reads all reports" on public.financial_reports for select to authenticated
  using ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])));

create policy "Public reads documents of published reports" on public.financial_report_documents
  for select to anon, authenticated
  using (exists (select 1 from public.financial_reports r where r.id = report_id and r.status = 'published'));
create policy "Finance reads all report documents" on public.financial_report_documents for select to authenticated
  using ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])));
create policy "Finance attaches report documents" on public.financial_report_documents for insert to authenticated
  with check (
    (select private.has_any_role(array['admin', 'treasurer']::public.app_role[]))
    and uploaded_by = (select auth.uid())
    and storage_path like 'reports/' || report_id::text || '/%'
  );
create policy "Finance removes draft report documents" on public.financial_report_documents for delete to authenticated
  using ((select private.has_any_role(array['admin', 'treasurer']::public.app_role[])));

-- Audit (donor contact details are never written to the audit log).
create trigger financial_accounts_audit after insert or update or delete on public.financial_accounts
  for each row execute function private.audit_row_change('values');
create trigger ledger_entries_audit after insert or update or delete on public.ledger_entries
  for each row execute function private.audit_row_change('values');
create trigger donations_audit after insert or update or delete on public.donations
  for each row execute function private.audit_row_change('values', 'donor_phone,donor_email,donor_message');
create trigger expenses_audit after insert or update or delete on public.expenses
  for each row execute function private.audit_row_change('values');
create trigger ledger_evidence_audit after insert or update or delete on public.ledger_evidence
  for each row execute function private.audit_row_change('values');
create trigger reconciliations_audit after insert on public.reconciliations
  for each row execute function private.audit_row_change('values');
create trigger financial_reports_audit after insert or update or delete on public.financial_reports
  for each row execute function private.audit_row_change('values', 'summary,narrative');
create trigger financial_report_documents_audit after insert or update or delete on public.financial_report_documents
  for each row execute function private.audit_row_change('values');

-- -----------------------------------------------------------------------------
-- Computation view: verified entries with reversals attributed to the type of
-- the entry they reverse. Not exposed through the API.
-- -----------------------------------------------------------------------------
create view private.ledger_effective as
select
  e.id,
  e.entry_no,
  e.entry_date,
  e.account_id,
  e.project_id,
  e.entry_type,
  coalesce(o.entry_type, e.entry_type) as effective_type,
  coalesce(o.expense_category, e.expense_category) as effective_expense_category,
  case e.direction when 'in' then e.amount when 'out' then -e.amount else 0 end as cash_delta,
  case when e.entry_type = 'reversal' then -e.amount else e.amount end as type_delta
from public.ledger_entries e
left join public.ledger_entries o on o.id = e.reverses_entry_id
where e.status = 'verified';

-- -----------------------------------------------------------------------------
-- Internal helpers
-- -----------------------------------------------------------------------------
create function private.finance_controls()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select value from public.site_settings where key = 'finance.controls'),
    '{"require_independent_verification": true, "require_independent_report_approval": true}'::jsonb
  );
$$;

create function private.account_locked_through(p_account_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select max(statement_date) from public.reconciliations where account_id = p_account_id and difference = 0;
$$;

create function private.account_opening_date(p_account_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select min(e.entry_date)
  from public.ledger_entries e
  where e.account_id = p_account_id
    and e.entry_type = 'opening_balance'
    and e.status <> 'rejected'
    and not exists (
      select 1 from public.ledger_entries r
      where r.reverses_entry_id = e.id and r.status = 'verified'
    );
$$;

create function private.assert_entry_date_allowed(p_account_id uuid, p_date date, p_is_opening boolean default false)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_locked date;
  v_opening date;
  v_account public.financial_accounts;
begin
  if p_date is null then
    perform private.fail('invalid:entry_date', 'Enter the transaction date.', '22023');
  end if;
  if p_date > (now() at time zone 'Asia/Kolkata')::date then
    perform private.fail('invalid:entry_date', 'Transaction dates cannot be in the future.', '22023');
  end if;
  if p_account_id is null then
    return;
  end if;
  select * into v_account from public.financial_accounts where id = p_account_id;
  if not found then
    perform private.fail('invalid:account_id', 'Choose an account.', '22023');
  end if;
  v_locked := private.account_locked_through(p_account_id);
  if v_locked is not null and p_date <= v_locked then
    perform private.fail(
      'period_closed',
      format('"%s" is reconciled up to %s. Use a later date (corrections are recorded in the current period).',
             v_account.name, to_char(v_locked, 'DD Mon YYYY'))
    );
  end if;
  if not p_is_opening then
    v_opening := private.account_opening_date(p_account_id);
    if v_opening is not null and p_date < v_opening then
      perform private.fail(
        'before_opening_balance',
        format('"%s" has an opening balance dated %s. Entries cannot be dated earlier.', v_account.name, to_char(v_opening, 'DD Mon YYYY'))
      );
    end if;
  end if;
end;
$$;

create function private.assert_account_active(p_account_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.financial_accounts where id = p_account_id and is_active) then
    perform private.fail('invalid:account_id', 'Choose an active account.', '22023');
  end if;
end;
$$;

create function private.assert_amount(p_amount numeric)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_amount is null or p_amount <= 0 then
    perform private.fail('invalid:amount', 'Enter an amount greater than zero.', '22023');
  end if;
  if p_amount <> round(p_amount, 2) then
    perform private.fail('invalid:amount', 'Amounts can have at most two decimal places.', '22023');
  end if;
  if p_amount > 100000000 then
    perform private.fail('invalid:amount', 'Amount is larger than the maximum allowed for a single entry.', '22023');
  end if;
end;
$$;

-- Flags a likely double entry: same type, account and amount within 3 days,
-- unless the two entries carry different payment references (identical
-- references are blocked outright by a unique index) or name different
-- donors/payees.
create function private.assert_possible_duplicate(
  p_entry_type public.ledger_entry_type,
  p_account_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_allow boolean,
  p_reference text default null,
  p_counterparty text default null,
  p_exclude_id uuid default null,
  p_project_id uuid default null
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_match bigint;
  v_reference text := nullif(btrim(p_reference), '');
  v_counterparty text := nullif(lower(btrim(p_counterparty)), '');
begin
  if coalesce(p_allow, false) then
    return;
  end if;
  select e.entry_no into v_match
  from public.ledger_entries e
  left join public.donations d on d.ledger_entry_id = e.id
  left join public.expenses x on x.ledger_entry_id = e.id
  where e.entry_type = p_entry_type
    and e.account_id is not distinct from p_account_id
    and e.amount = p_amount
    and abs(e.entry_date - p_entry_date) <= 3
    and e.status <> 'rejected'
    and (p_exclude_id is null or e.id <> p_exclude_id)
    and (e.entry_type <> 'allocation' or e.project_id is not distinct from p_project_id)
    and (v_reference is null or e.transaction_reference is null)
    and (
      v_counterparty is null
      or coalesce(d.donor_name, x.payee_name) is null
      or lower(btrim(coalesce(d.donor_name, x.payee_name))) = v_counterparty
    )
  order by e.entry_no desc
  limit 1;
  if v_match is not null then
    perform private.fail(
      'possible_duplicate',
      format('A similar entry already exists (TXN-%s: same type, account, amount and payer/payee within 3 days). Confirm it is not a duplicate to continue.',
             lpad(v_match::text, 6, '0'))
    );
  end if;
end;
$$;

create function private.assert_replacement(p_replaces_entry_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_replaces_entry_id is null then
    return;
  end if;
  if not exists (
    select 1 from public.ledger_entries r
    where r.reverses_entry_id = p_replaces_entry_id and r.status <> 'rejected'
  ) then
    perform private.fail('replacement_requires_reversal', 'Reverse the original entry before recording its replacement.');
  end if;
end;
$$;

create function private.next_receipt_number(p_date date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start integer := case when extract(month from p_date) >= 4 then extract(year from p_date)::integer
                          else extract(year from p_date)::integer - 1 end;
  v_label text := v_start::text || '-' || lpad(((v_start + 1) % 100)::text, 2, '0');
  v_no integer;
begin
  insert into private.receipt_counters as rc (financial_year, last_number)
  values (v_label, 1)
  on conflict (financial_year) do update set last_number = rc.last_number + 1
  returning last_number into v_no;
  return 'PRY/' || v_label || '/' || lpad(v_no::text, 4, '0');
end;
$$;

create function private.entry_label(p_entry_no bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'TXN-' || lpad(p_entry_no::text, 6, '0');
$$;

-- -----------------------------------------------------------------------------
-- Recording entries (treasurer / admin)
-- -----------------------------------------------------------------------------
create function public.finance_record_donation(
  p_entry_type public.ledger_entry_type,
  p_entry_date date,
  p_amount numeric,
  p_account_id uuid,
  p_payment_method public.payment_method,
  p_transaction_reference text,
  p_description text,
  p_project_id uuid default null,
  p_donor_name text default null,
  p_donor_phone text default null,
  p_donor_email text default null,
  p_is_anonymous boolean default false,
  p_acknowledge_publicly boolean default false,
  p_allow_possible_duplicate boolean default false,
  p_replaces_entry_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_phone text;
begin
  perform private.require_role(array['admin', 'treasurer']::public.app_role[]);
  if p_entry_type not in ('member_contribution', 'public_donation') then
    perform private.fail('invalid:entry_type', 'Choose member contribution or public donation.', '22023');
  end if;
  if p_entry_type = 'member_contribution' and coalesce(p_is_anonymous, false) then
    perform private.fail('invalid:is_anonymous', 'Member contributions must record the member''s name.', '22023');
  end if;
  if not coalesce(p_is_anonymous, false) and char_length(btrim(coalesce(p_donor_name, ''))) < 2 then
    perform private.fail('invalid:donor_name', 'Enter the donor''s name or mark the donation as anonymous.', '22023');
  end if;
  if nullif(btrim(p_donor_phone), '') is not null then
    v_phone := private.normalize_phone(p_donor_phone);
    if v_phone is null then
      perform private.fail('invalid:donor_phone', 'Enter a valid phone number.', '22023');
    end if;
  end if;
  if nullif(btrim(p_donor_email), '') is not null and not private.is_valid_email(lower(btrim(p_donor_email))) then
    perform private.fail('invalid:donor_email', 'Enter a valid email address.', '22023');
  end if;
  if p_payment_method is null then
    perform private.fail('invalid:payment_method', 'Choose the payment method.', '22023');
  end if;
  perform private.assert_amount(p_amount);
  perform private.assert_account_active(p_account_id);
  perform private.assert_entry_date_allowed(p_account_id, p_entry_date);
  perform private.assert_replacement(p_replaces_entry_id);
  perform private.assert_possible_duplicate(
    p_entry_type, p_account_id, p_amount, p_entry_date, p_allow_possible_duplicate, p_transaction_reference,
    case when coalesce(p_is_anonymous, false) then null else p_donor_name end
  );

  insert into public.ledger_entries (
    entry_date, entry_type, direction, amount, account_id, project_id, payment_method,
    transaction_reference, description, recorded_by, replaces_entry_id
  ) values (
    p_entry_date, p_entry_type, 'in', p_amount, p_account_id, p_project_id, p_payment_method,
    nullif(btrim(p_transaction_reference), ''), btrim(p_description), (select auth.uid()), p_replaces_entry_id
  )
  returning id into v_id;

  insert into public.donations (ledger_entry_id, donor_name, donor_phone, donor_email, is_anonymous, acknowledge_publicly)
  values (
    v_id,
    case when coalesce(p_is_anonymous, false) then nullif(btrim(p_donor_name), '') else btrim(p_donor_name) end,
    v_phone,
    nullif(lower(btrim(p_donor_email)), ''),
    coalesce(p_is_anonymous, false),
    coalesce(p_acknowledge_publicly, false) and not coalesce(p_is_anonymous, false)
  );

  return v_id;
end;
$$;

create function public.finance_record_expense(
  p_entry_date date,
  p_amount numeric,
  p_account_id uuid,
  p_payment_method public.payment_method,
  p_transaction_reference text,
  p_description text,
  p_expense_category public.expense_category,
  p_payee_name text,
  p_project_id uuid default null,
  p_bill_reference text default null,
  p_assistance_reference text default null,
  p_allow_possible_duplicate boolean default false,
  p_replaces_entry_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_request_id uuid;
  v_request_status public.assistance_status;
begin
  perform private.require_role(array['admin', 'treasurer']::public.app_role[]);
  if p_expense_category is null then
    perform private.fail('invalid:expense_category', 'Choose an expense category.', '22023');
  end if;
  if char_length(btrim(coalesce(p_payee_name, ''))) < 2 then
    perform private.fail('invalid:payee_name', 'Enter who was paid.', '22023');
  end if;
  if p_payment_method is null then
    perform private.fail('invalid:payment_method', 'Choose the payment method.', '22023');
  end if;
  perform private.assert_amount(p_amount);
  perform private.assert_account_active(p_account_id);
  perform private.assert_entry_date_allowed(p_account_id, p_entry_date);
  perform private.assert_replacement(p_replaces_entry_id);

  if nullif(btrim(p_assistance_reference), '') is not null then
    select id, status into v_request_id, v_request_status
    from public.assistance_requests
    where reference_code = private.normalize_reference(p_assistance_reference);
    if v_request_id is null then
      perform private.fail('invalid:assistance_reference', 'No assistance request has that reference number.', '22023');
    end if;
    if v_request_status not in ('approved', 'assistance_provided') then
      perform private.fail('invalid:assistance_reference', 'That assistance request has not been approved.', '22023');
    end if;
  end if;

  perform private.assert_possible_duplicate(
    'expense', p_account_id, p_amount, p_entry_date, p_allow_possible_duplicate, p_transaction_reference, p_payee_name
  );

  insert into public.ledger_entries (
    entry_date, entry_type, direction, amount, account_id, project_id, expense_category, payment_method,
    transaction_reference, description, recorded_by, replaces_entry_id
  ) values (
    p_entry_date, 'expense', 'out', p_amount, p_account_id, p_project_id, p_expense_category, p_payment_method,
    nullif(btrim(p_transaction_reference), ''), btrim(p_description), (select auth.uid()), p_replaces_entry_id
  )
  returning id into v_id;

  insert into public.expenses (ledger_entry_id, payee_name, bill_reference, assistance_request_id)
  values (v_id, btrim(p_payee_name), nullif(btrim(p_bill_reference), ''), v_request_id);

  return v_id;
end;
$$;

-- Opening balances, other income, refunds and project allocations.
create function public.finance_record_entry(
  p_entry_type public.ledger_entry_type,
  p_entry_date date,
  p_amount numeric,
  p_description text,
  p_account_id uuid default null,
  p_payment_method public.payment_method default null,
  p_transaction_reference text default null,
  p_project_id uuid default null,
  p_related_entry_id uuid default null,
  p_allow_possible_duplicate boolean default false,
  p_replaces_entry_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_direction public.ledger_direction;
  v_related public.ledger_entries;
  v_refunded numeric;
begin
  perform private.require_role(array['admin', 'treasurer']::public.app_role[]);
  if p_entry_type not in ('opening_balance', 'other_income', 'refund', 'allocation') then
    perform private.fail('invalid:entry_type', 'Use the donation, expense or transfer forms for that entry type.', '22023');
  end if;
  perform private.assert_amount(p_amount);
  perform private.assert_replacement(p_replaces_entry_id);

  if p_entry_type = 'allocation' then
    v_direction := 'internal';
    if p_project_id is null or not exists (select 1 from public.projects where id = p_project_id) then
      perform private.fail('invalid:project_id', 'Choose the project receiving the allocation.', '22023');
    end if;
    perform private.assert_entry_date_allowed(null, p_entry_date);
  else
    v_direction := case when p_entry_type = 'refund' then 'out' else 'in' end;
    if p_payment_method is null then
      perform private.fail('invalid:payment_method', 'Choose the payment method.', '22023');
    end if;
    perform private.assert_account_active(p_account_id);
    perform private.assert_entry_date_allowed(p_account_id, p_entry_date, p_entry_type = 'opening_balance');
  end if;

  if p_entry_type = 'opening_balance' then
    if private.account_opening_date(p_account_id) is not null then
      perform private.fail('opening_balance_exists', 'This account already has an opening balance. Reverse it first to correct it.');
    end if;
    if exists (
      select 1 from public.ledger_entries
      where account_id = p_account_id and status <> 'rejected' and entry_type <> 'opening_balance'
        and entry_date < p_entry_date
    ) then
      perform private.fail('invalid:entry_date', 'The opening balance must be dated on or before the account''s first entry.', '22023');
    end if;
  end if;

  if p_entry_type = 'refund' then
    select * into v_related from public.ledger_entries where id = p_related_entry_id;
    if not found or v_related.entry_type not in ('member_contribution', 'public_donation') or v_related.status <> 'verified' then
      perform private.fail('invalid:related_entry_id', 'Refunds must reference a verified donation or contribution.', '22023');
    end if;
    select coalesce(sum(amount), 0) into v_refunded
    from public.ledger_entries
    where related_entry_id = p_related_entry_id and entry_type = 'refund' and status <> 'rejected';
    if v_refunded + p_amount > v_related.amount then
      perform private.fail('invalid:amount', 'Refunds cannot exceed the original donation.', '22023');
    end if;
  end if;

  perform private.assert_possible_duplicate(
    p_entry_type, case when v_direction = 'internal' then null else p_account_id end, p_amount, p_entry_date,
    p_allow_possible_duplicate, p_transaction_reference, null, null, p_project_id
  );

  insert into public.ledger_entries (
    entry_date, entry_type, direction, amount, account_id, project_id, payment_method, transaction_reference,
    description, recorded_by, related_entry_id, replaces_entry_id
  ) values (
    p_entry_date, p_entry_type, v_direction, p_amount,
    case when v_direction = 'internal' then null else p_account_id end,
    p_project_id,
    case when v_direction = 'internal' then null else p_payment_method end,
    case when v_direction = 'internal' then null else nullif(btrim(p_transaction_reference), '') end,
    btrim(p_description), (select auth.uid()),
    case when p_entry_type = 'refund' then p_related_entry_id end,
    p_replaces_entry_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Moving money between the organisation's own accounts (e.g. depositing cash).
create function public.finance_record_transfer(
  p_entry_date date,
  p_amount numeric,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_payment_method public.payment_method,
  p_transaction_reference text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := gen_random_uuid();
begin
  perform private.require_role(array['admin', 'treasurer']::public.app_role[]);
  if p_from_account_id = p_to_account_id then
    perform private.fail('invalid:to_account_id', 'Choose two different accounts.', '22023');
  end if;
  if p_payment_method is null then
    perform private.fail('invalid:payment_method', 'Choose the payment method.', '22023');
  end if;
  perform private.assert_amount(p_amount);
  perform private.assert_account_active(p_from_account_id);
  perform private.assert_account_active(p_to_account_id);
  perform private.assert_entry_date_allowed(p_from_account_id, p_entry_date);
  perform private.assert_entry_date_allowed(p_to_account_id, p_entry_date);

  insert into public.ledger_entries (
    entry_date, entry_type, direction, amount, account_id, payment_method, transaction_reference, description,
    recorded_by, transfer_group_id
  ) values
    (p_entry_date, 'transfer', 'out', p_amount, p_from_account_id, p_payment_method,
     nullif(btrim(p_transaction_reference), ''), btrim(p_description), (select auth.uid()), v_group),
    (p_entry_date, 'transfer', 'in', p_amount, p_to_account_id, p_payment_method,
     nullif(btrim(p_transaction_reference), ''), btrim(p_description), (select auth.uid()), v_group);

  return v_group;
end;
$$;

-- Edit a pending entry. `p_changes` keys that are present are applied
-- (a JSON null clears the field). Transfers and reversals cannot be edited.
create function public.finance_update_pending_entry(p_entry_id uuid, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ledger_entries;
  v_allowed text[] := array[
    'entry_date', 'amount', 'account_id', 'payment_method', 'transaction_reference', 'description', 'project_id',
    'expense_category', 'donor_name', 'donor_phone', 'donor_email', 'is_anonymous', 'acknowledge_publicly',
    'payee_name', 'bill_reference'
  ];
  v_phone text;
begin
  perform private.require_role(array['admin', 'treasurer']::public.app_role[]);
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or not private.json_has_only(p_changes, v_allowed) then
    perform private.fail('invalid_changes', 'Unsupported change.', '22023');
  end if;

  select * into v from public.ledger_entries where id = p_entry_id for update;
  if not found then
    perform private.fail('not_found', 'Entry not found.');
  end if;
  if v.status <> 'pending' then
    perform private.fail('immutable_entry', 'Only pending entries can be edited.');
  end if;
  if v.entry_type in ('transfer', 'reversal') then
    perform private.fail('not_editable', 'Transfers and reversals cannot be edited. Reject and record again.');
  end if;

  if p_changes ? 'amount' then
    perform private.assert_amount((p_changes ->> 'amount')::numeric);
  end if;
  if p_changes ? 'account_id' and v.direction <> 'internal' then
    perform private.assert_account_active((p_changes ->> 'account_id')::uuid);
  end if;

  update public.ledger_entries set
    entry_date = case when p_changes ? 'entry_date' then (p_changes ->> 'entry_date')::date else entry_date end,
    amount = case when p_changes ? 'amount' then (p_changes ->> 'amount')::numeric else amount end,
    account_id = case when p_changes ? 'account_id' and direction <> 'internal' then (p_changes ->> 'account_id')::uuid else account_id end,
    payment_method = case when p_changes ? 'payment_method' and direction <> 'internal'
                          then (p_changes ->> 'payment_method')::public.payment_method else payment_method end,
    transaction_reference = case when p_changes ? 'transaction_reference' and direction <> 'internal'
                                 then nullif(btrim(p_changes ->> 'transaction_reference'), '') else transaction_reference end,
    description = case when p_changes ? 'description' then btrim(p_changes ->> 'description') else description end,
    project_id = case when p_changes ? 'project_id' then (p_changes ->> 'project_id')::uuid else project_id end,
    expense_category = case when p_changes ? 'expense_category' and entry_type = 'expense'
                            then (p_changes ->> 'expense_category')::public.expense_category else expense_category end,
    last_edited_by = (select auth.uid()),
    last_edited_at = now()
  where id = p_entry_id
  returning * into v;

  if v.entry_type = 'allocation' and v.project_id is null then
    perform private.fail('invalid:project_id', 'Allocations must have a project.', '22023');
  end if;
  perform private.assert_entry_date_allowed(v.account_id, v.entry_date, v.entry_type = 'opening_balance');

  if v.entry_type in ('member_contribution', 'public_donation') then
    if p_changes ? 'donor_phone' and nullif(btrim(p_changes ->> 'donor_phone'), '') is not null then
      v_phone := private.normalize_phone(p_changes ->> 'donor_phone');
      if v_phone is null then
        perform private.fail('invalid:donor_phone', 'Enter a valid phone number.', '22023');
      end if;
    end if;
    update public.donations set
      donor_name = case when p_changes ? 'donor_name' then nullif(btrim(p_changes ->> 'donor_name'), '') else donor_name end,
      donor_phone = case when p_changes ? 'donor_phone' then v_phone else donor_phone end,
      donor_email = case when p_changes ? 'donor_email' then nullif(lower(btrim(p_changes ->> 'donor_email')), '') else donor_email end,
      is_anonymous = case when p_changes ? 'is_anonymous' then (p_changes ->> 'is_anonymous')::boolean else is_anonymous end,
      acknowledge_publicly = case when p_changes ? 'acknowledge_publicly' then (p_changes ->> 'acknowledge_publicly')::boolean else acknowledge_publicly end
    where ledger_entry_id = p_entry_id;
  elsif v.entry_type = 'expense' then
    update public.expenses set
      payee_name = case when p_changes ? 'payee_name' then btrim(p_changes ->> 'payee_name') else payee_name end,
      bill_reference = case when p_changes ? 'bill_reference' then nullif(btrim(p_changes ->> 'bill_reference'), '') else bill_reference end
    where ledger_entry_id = p_entry_id;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Verification, rejection, reversal
-- -----------------------------------------------------------------------------
create function public.finance_verify_entry(p_entry_id uuid, p_note text default null, p_account_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v public.ledger_entries;
  v_leg public.ledger_entries;
  v_original public.ledger_entries;
  v_ids uuid[];
  v_independent boolean := coalesce((private.finance_controls() ->> 'require_independent_verification')::boolean, true);
  v_note text := nullif(btrim(p_note), '');
  v_receipt text;
begin
  perform private.require_role(array['admin', 'treasurer']::public.app_role[]);
  select * into v from public.ledger_entries where id = p_entry_id for update;
  if not found then
    perform private.fail('not_found', 'Entry not found.');
  end if;
  if v.status <> 'pending' then
    perform private.fail('not_pending', 'Only pending entries can be verified.');
  end if;

  v_ids := case when v.entry_type = 'transfer'
    then array(select id from public.ledger_entries where transfer_group_id = v.transfer_group_id order by id)
    else array[v.id] end;

  for v_leg in select * from public.ledger_entries where id = any (v_ids) for update loop
    if v_leg.status <> 'pending' then
      perform private.fail('not_pending', 'Both sides of a transfer must be pending.');
    end if;
    if v_independent and (v_leg.recorded_by = v_me or v_leg.last_edited_by = v_me) then
      perform private.fail(
        'independent_verification_required',
        'You recorded or edited this entry, so another treasurer or administrator must verify it.'
      );
    end if;
    if v_leg.account_id is not null then
      perform private.assert_entry_date_allowed(v_leg.account_id, v_leg.entry_date, v_leg.entry_type = 'opening_balance');
    end if;
  end loop;

  if v.direction <> 'internal' and v.account_id is null then
    if p_account_id is null then
      perform private.fail('account_required', 'Choose the account this payment was received into.');
    end if;
    perform private.assert_account_active(p_account_id);
    perform private.assert_entry_date_allowed(p_account_id, v.entry_date);
    update public.ledger_entries set account_id = p_account_id where id = v.id returning * into v;
  end if;

  if v.entry_type = 'reversal' then
    select * into v_original from public.ledger_entries where id = v.reverses_entry_id;
    if v_original.status <> 'verified' then
      perform private.fail('original_not_verified', 'The entry being reversed is not verified.');
    end if;
  end if;

  if v.entry_type in ('expense', 'refund', 'opening_balance')
     and not exists (select 1 from public.ledger_evidence where ledger_entry_id = v.id) then
    perform private.fail('evidence_required', 'Attach the bill, receipt or statement before verifying this entry.');
  end if;
  -- A donor's own screenshot is never proof: unless independent evidence (bank
  -- statement, receipt, bill) is attached, the verifier must record how the
  -- payment was matched.
  if v_note is null and not exists (
    select 1 from public.ledger_evidence
    where ledger_entry_id = any (v_ids) and kind <> 'payment_screenshot'
  ) then
    perform private.fail('verification_note_required', 'Record how you verified this entry (e.g. matched to the bank statement line), or attach independent evidence.');
  end if;

  update public.ledger_entries
  set status = 'verified', verified_by = v_me, verified_at = now(), verification_note = v_note
  where id = any (v_ids);

  if v.entry_type in ('member_contribution', 'public_donation') then
    v_receipt := private.next_receipt_number(v.entry_date);
    update public.donations
    set receipt_number = v_receipt, receipt_issued_at = now()
    where ledger_entry_id = v.id;
  end if;

  return jsonb_build_object('verified', to_jsonb(v_ids), 'receipt_number', v_receipt);
end;
$$;

create function public.finance_reject_entry(p_entry_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ledger_entries;
begin
  perform private.require_role(array['admin', 'treasurer']::public.app_role[]);
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    perform private.fail('invalid:reason', 'Explain why the entry is rejected.', '22023');
  end if;
  select * into v from public.ledger_entries where id = p_entry_id for update;
  if not found then
    perform private.fail('not_found', 'Entry not found.');
  end if;
  if v.status <> 'pending' then
    perform private.fail('not_pending', 'Only pending entries can be rejected.');
  end if;
  update public.ledger_entries
  set status = 'rejected', rejected_by = (select auth.uid()), rejected_at = now(), rejection_reason = btrim(p_reason)
  where id = p_entry_id
     or (v.entry_type = 'transfer' and transfer_group_id = v.transfer_group_id);
end;
$$;

create function public.finance_reverse_entry(p_entry_id uuid, p_reason text, p_entry_date date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ledger_entries;
  v_leg public.ledger_entries;
  v_date date := coalesce(p_entry_date, (now() at time zone 'Asia/Kolkata')::date);
  v_first uuid;
  v_new uuid;
begin
  perform private.require_role(array['admin', 'treasurer']::public.app_role[]);
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    perform private.fail('invalid:reason', 'Explain why the entry is being reversed.', '22023');
  end if;
  select * into v from public.ledger_entries where id = p_entry_id;
  if not found then
    perform private.fail('not_found', 'Entry not found.');
  end if;
  if v.status <> 'verified' then
    perform private.fail('not_verified', 'Only verified entries can be reversed. Reject pending entries instead.');
  end if;
  if v.entry_type = 'reversal' then
    perform private.fail('cannot_reverse_reversal', 'A reversal cannot itself be reversed. Record a new entry instead.');
  end if;

  for v_leg in
    select * from public.ledger_entries
    where id = p_entry_id or (v.entry_type = 'transfer' and transfer_group_id = v.transfer_group_id)
    order by direction
    for update
  loop
    if exists (select 1 from public.ledger_entries where reverses_entry_id = v_leg.id and status <> 'rejected') then
      perform private.fail('already_reversed', format('%s has already been reversed.', private.entry_label(v_leg.entry_no)));
    end if;
    if v_date < v_leg.entry_date then
      perform private.fail('invalid:entry_date', 'A reversal cannot be dated before the original entry.', '22023');
    end if;
    if v_leg.account_id is not null then
      perform private.assert_entry_date_allowed(v_leg.account_id, v_date);
    else
      perform private.assert_entry_date_allowed(null, v_date);
    end if;


    insert into public.ledger_entries (
      entry_date, entry_type, direction, amount, account_id, project_id, expense_category, payment_method,
      description, recorded_by, reverses_entry_id, correction_reason
    ) values (
      v_date, 'reversal',
      case v_leg.direction when 'in' then 'out'::public.ledger_direction when 'out' then 'in'::public.ledger_direction else 'internal'::public.ledger_direction end,
      v_leg.amount, v_leg.account_id, v_leg.project_id, v_leg.expense_category, v_leg.payment_method,
      left('Reversal of ' || private.entry_label(v_leg.entry_no) || ': ' || btrim(p_reason), 500),
      (select auth.uid()), v_leg.id, btrim(p_reason)
    )
    returning id into v_new;
    v_first := coalesce(v_first, v_new);
  end loop;

  return v_first;
end;
$$;

-- -----------------------------------------------------------------------------
-- Balances, summaries and reconciliation
-- -----------------------------------------------------------------------------
create function public.finance_account_balances(p_as_of date default null)
returns table (
  account_id uuid,
  name text,
  account_type public.account_type,
  is_active boolean,
  balance numeric,
  pending_in numeric,
  pending_out numeric,
  pending_count bigint,
  locked_through date,
  last_reconciled_on date,
  last_difference numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_as_of date := coalesce(p_as_of, (now() at time zone 'Asia/Kolkata')::date);
begin
  perform private.require_role(array['admin', 'treasurer']::public.app_role[]);
  return query
  select
    a.id,
    a.name,
    a.account_type,
    a.is_active,
    coalesce((select sum(le.cash_delta) from private.ledger_effective le
              where le.account_id = a.id and le.entry_date <= v_as_of), 0)::numeric,
    coalesce((select sum(e.amount) from public.ledger_entries e
              where e.account_id = a.id and e.status = 'pending' and e.direction = 'in'), 0)::numeric,
    coalesce((select sum(e.amount) from public.ledger_entries e
              where e.account_id = a.id and e.status = 'pending' and e.direction = 'out'), 0)::numeric,
    (select count(*) from public.ledger_entries e where e.account_id = a.id and e.status = 'pending'),
    private.account_locked_through(a.id),
    r.statement_date,
    r.difference
  from public.financial_accounts a
  left join lateral (
    select statement_date, difference from public.reconciliations
    where reconciliations.account_id = a.id
    order by statement_date desc, created_at desc
    limit 1
  ) r on true
  order by a.is_active desc, a.name;
end;
$$;

-- Internal: aggregate figures for a period, from verified entries only.
create function private.period_figures(p_start date, p_end date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with period as (
    select * from private.ledger_effective where entry_date between p_start and p_end
  )
  select jsonb_build_object(
    'opening_balance', coalesce((select sum(cash_delta) from private.ledger_effective where entry_date < p_start), 0),
    'closing_balance', coalesce((select sum(cash_delta) from private.ledger_effective where entry_date <= p_end), 0),
    'income', jsonb_build_object(
      'member_contributions', coalesce((select sum(type_delta) from period where effective_type = 'member_contribution'), 0),
      'public_donations', coalesce((select sum(type_delta) from period where effective_type = 'public_donation'), 0),
      'other_income', coalesce((select sum(type_delta) from period where effective_type = 'other_income'), 0)
    ),
    'opening_balances_recorded', coalesce((select sum(type_delta) from period where effective_type = 'opening_balance'), 0),
    'expenditure_by_category', coalesce((
      select jsonb_object_agg(effective_expense_category, total)
      from (
        select effective_expense_category, sum(type_delta) as total
        from period where effective_type = 'expense'
        group by effective_expense_category
      ) x
    ), '{}'::jsonb),
    'expenditure_total', coalesce((select sum(type_delta) from period where effective_type = 'expense'), 0),
    'refunds', coalesce((select sum(type_delta) from period where effective_type = 'refund'), 0),
    'allocations', coalesce((select sum(type_delta) from period where effective_type = 'allocation'), 0),
    'contribution_count', (
      select count(*) from period where entry_type in ('member_contribution', 'public_donation')
    ),
    'expense_count', (select count(*) from period where entry_type = 'expense')
  );
$$;

create function public.finance_period_summary(p_start date, p_end date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform private.require_role(array['admin', 'treasurer']::public.app_role[]);
  if p_start is null or p_end is null or p_end < p_start then
    perform private.fail('invalid:period', 'Choose a valid period.', '22023');
  end if;
  v := private.period_figures(p_start, p_end);
  return v || jsonb_build_object(
    'period', jsonb_build_object('start', p_start, 'end', p_end),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'account_id', a.id,
        'name', a.name,
        'opening', coalesce((select sum(cash_delta) from private.ledger_effective le where le.account_id = a.id and le.entry_date < p_start), 0),
        'inflow', coalesce((select sum(cash_delta) from private.ledger_effective le where le.account_id = a.id and le.entry_date between p_start and p_end and cash_delta > 0), 0),
        'outflow', coalesce((select -sum(cash_delta) from private.ledger_effective le where le.account_id = a.id and le.entry_date between p_start and p_end and cash_delta < 0), 0),
        'closing', coalesce((select sum(cash_delta) from private.ledger_effective le where le.account_id = a.id and le.entry_date <= p_end), 0)
      ) order by a.name)
      from public.financial_accounts a
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'project_id', p.id,
        'title', p.title,
        'is_published', p.is_published,
        'allocated', coalesce((select sum(type_delta) from private.ledger_effective le where le.project_id = p.id and le.effective_type = 'allocation' and le.entry_date <= p_end), 0),
        'restricted_income', coalesce((select sum(type_delta) from private.ledger_effective le where le.project_id = p.id and le.effective_type in ('member_contribution', 'public_donation') and le.entry_date <= p_end), 0),
        'expenditure_in_period', coalesce((select sum(type_delta) from private.ledger_effective le where le.project_id = p.id and le.effective_type = 'expense' and le.entry_date between p_start and p_end), 0),
        'expenditure_to_date', coalesce((select sum(type_delta) from private.ledger_effective le where le.project_id = p.id and le.effective_type = 'expense' and le.entry_date <= p_end), 0)
      ) order by p.title)
      from public.projects p
      where exists (select 1 from public.ledger_entries e where e.project_id = p.id and e.status = 'verified')
    ), '[]'::jsonb),
    'pending', jsonb_build_object(
      'count', (select count(*) from public.ledger_entries where status = 'pending' and entry_date <= p_end),
      'amount_in', coalesce((select sum(amount) from public.ledger_entries where status = 'pending' and direction = 'in' and entry_date <= p_end), 0),
      'amount_out', coalesce((select sum(amount) from public.ledger_entries where status = 'pending' and direction = 'out' and entry_date <= p_end), 0)
    )
  );
end;
$$;

-- Public-safe snapshot used for published reports: aggregates only, no names
-- of donors, payees or internal accounts; unpublished projects are combined.
create function private.public_report_snapshot(p_start date, p_end date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.period_figures(p_start, p_end) || jsonb_build_object(
    'version', 1,
    'currency', 'INR',
    'period', jsonb_build_object('start', p_start, 'end', p_end),
    'generated_at', now(),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('project_id', p.id, 'slug', p.slug, 'title', p.title, 'expenditure', x.total) order by p.title)
      from (
        select project_id, sum(type_delta) as total
        from private.ledger_effective
        where effective_type = 'expense' and project_id is not null and entry_date between p_start and p_end
        group by project_id
      ) x
      join public.projects p on p.id = x.project_id and p.is_published
    ), '[]'::jsonb),
    'other_project_expenditure', coalesce((
      select sum(le.type_delta)
      from private.ledger_effective le
      join public.projects p on p.id = le.project_id and not p.is_published
      where le.effective_type = 'expense' and le.entry_date between p_start and p_end
    ), 0)
  );
$$;

create function public.finance_reconcile(
  p_account_id uuid,
  p_statement_date date,
  p_statement_balance numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_computed numeric;
  v_pending integer;
  v_locked date;
  v_row public.reconciliations;
begin
  perform private.require_role(array['admin', 'treasurer']::public.app_role[]);
  if not exists (select 1 from public.financial_accounts where id = p_account_id) then
    perform private.fail('invalid:account_id', 'Choose an account.', '22023');
  end if;
  if p_statement_date is null or p_statement_date > (now() at time zone 'Asia/Kolkata')::date then
    perform private.fail('invalid:statement_date', 'The statement date cannot be in the future.', '22023');
  end if;
  if p_statement_balance is null or p_statement_balance <> round(p_statement_balance, 2) then
    perform private.fail('invalid:statement_balance', 'Enter the statement balance (up to two decimals).', '22023');
  end if;
  v_locked := private.account_locked_through(p_account_id);
  if v_locked is not null and p_statement_date < v_locked then
    perform private.fail('invalid:statement_date', format('This account is already reconciled up to %s.', to_char(v_locked, 'DD Mon YYYY')), '22023');
  end if;

  select coalesce(sum(cash_delta), 0) into v_computed
  from private.ledger_effective where account_id = p_account_id and entry_date <= p_statement_date;

  select count(*) into v_pending
  from public.ledger_entries
  where account_id = p_account_id and status = 'pending' and entry_date <= p_statement_date;

  insert into public.reconciliations (account_id, statement_date, statement_balance, computed_balance, pending_entries_count, notes, performed_by)
  values (p_account_id, p_statement_date, p_statement_balance, v_computed, v_pending, nullif(btrim(p_notes), ''), (select auth.uid()))
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- -----------------------------------------------------------------------------
-- Public financial reports
-- -----------------------------------------------------------------------------
create function public.finance_create_report(
  p_title text,
  p_period_type public.report_period,
  p_start date,
  p_end date,
  p_narrative text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_role(array['admin', 'treasurer']::public.app_role[]);
  if p_start is null or p_end is null or p_end < p_start then
    perform private.fail('invalid:period', 'Choose a valid period.', '22023');
  end if;
  if p_end > (now() at time zone 'Asia/Kolkata')::date then
    perform private.fail('invalid:period', 'Reports can only cover periods that have ended.', '22023');
  end if;
  insert into public.financial_reports (title, period_type, period_start, period_end, summary, narrative, prepared_by)
  values (btrim(p_title), p_period_type, p_start, p_end, private.public_report_snapshot(p_start, p_end),
          coalesce(p_narrative, ''), (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.finance_update_report_draft(
  p_report_id uuid,
  p_title text,
  p_narrative text,
  p_refresh_snapshot boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.financial_reports;
begin
  perform private.require_role(array['admin', 'treasurer']::public.app_role[]);
  select * into v from public.financial_reports where id = p_report_id for update;
  if not found then
    perform private.fail('not_found', 'Report not found.');
  end if;
  if v.status <> 'draft' then
    perform private.fail('report_not_draft', 'Only draft reports can be edited.');
  end if;
  update public.financial_reports
  set title = coalesce(nullif(btrim(p_title), ''), title),
      narrative = coalesce(p_narrative, narrative),
      summary = case when p_refresh_snapshot then private.public_report_snapshot(period_start, period_end) else summary end,
      snapshot_generated_at = case when p_refresh_snapshot then now() else snapshot_generated_at end
  where id = p_report_id;
end;
$$;

create function public.finance_publish_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.financial_reports;
  v_me uuid := (select auth.uid());
  v_independent boolean := coalesce((private.finance_controls() ->> 'require_independent_report_approval')::boolean, true);
begin
  perform private.require_role(array['admin', 'treasurer']::public.app_role[]);
  select * into v from public.financial_reports where id = p_report_id for update;
  if not found then
    perform private.fail('not_found', 'Report not found.');
  end if;
  if v.status <> 'draft' then
    perform private.fail('report_not_draft', 'Only draft reports can be published.');
  end if;
  if v_independent and v.prepared_by = v_me then
    perform private.fail('independent_approval_required', 'Another treasurer or administrator must approve a report you prepared.');
  end if;
  -- Re-freeze the figures at approval time so the published numbers match the ledger.
  update public.financial_reports
  set summary = private.public_report_snapshot(period_start, period_end),
      snapshot_generated_at = now(),
      status = 'published',
      approved_by = v_me,
      published_at = now()
  where id = p_report_id;
end;
$$;

create function public.finance_withdraw_report(p_report_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(array['admin']::public.app_role[]);
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    perform private.fail('invalid:reason', 'Explain why the report is withdrawn.', '22023');
  end if;
  update public.financial_reports
  set status = 'withdrawn', withdrawn_by = (select auth.uid()), withdrawn_at = now(), withdrawal_reason = btrim(p_reason)
  where id = p_report_id and status = 'published';
  if not found then
    perform private.fail('not_published', 'Only published reports can be withdrawn.');
  end if;
end;
$$;

create function public.finance_delete_report_draft(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(array['admin', 'treasurer']::public.app_role[]);
  if exists (select 1 from public.financial_report_documents where report_id = p_report_id) then
    perform private.fail('has_documents', 'Remove the attached documents first.');
  end if;
  delete from public.financial_reports where id = p_report_id and status = 'draft';
  if not found then
    perform private.fail('report_not_draft', 'Only draft reports can be deleted.');
  end if;
end;
$$;

-- Public: approved budget and verified expenditure of a published project,
-- only when the finance team has opted in for that project.
create function public.get_project_finance(p_project_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'approved_budget', b.approved_budget,
    'approved_on', b.approved_on,
    'verified_expenditure', coalesce((
      select sum(le.type_delta) from private.ledger_effective le
      where le.project_id = p.id and le.effective_type = 'expense'
    ), 0),
    'as_of', (now() at time zone 'Asia/Kolkata')::date
  )
  from public.projects p
  join public.project_budgets b on b.project_id = p.id
  where p.id = p_project_id and p.is_published and b.show_publicly;
$$;

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------
revoke all on function public.finance_record_donation(public.ledger_entry_type, date, numeric, uuid, public.payment_method, text, text, uuid, text, text, text, boolean, boolean, boolean, uuid) from public, anon, authenticated;
revoke all on function public.finance_record_expense(date, numeric, uuid, public.payment_method, text, text, public.expense_category, text, uuid, text, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.finance_record_entry(public.ledger_entry_type, date, numeric, text, uuid, public.payment_method, text, uuid, uuid, boolean, uuid) from public, anon, authenticated;
revoke all on function public.finance_record_transfer(date, numeric, uuid, uuid, public.payment_method, text, text) from public, anon, authenticated;
revoke all on function public.finance_update_pending_entry(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finance_verify_entry(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.finance_reject_entry(uuid, text) from public, anon, authenticated;
revoke all on function public.finance_reverse_entry(uuid, text, date) from public, anon, authenticated;
revoke all on function public.finance_account_balances(date) from public, anon, authenticated;
revoke all on function public.finance_period_summary(date, date) from public, anon, authenticated;
revoke all on function public.finance_reconcile(uuid, date, numeric, text) from public, anon, authenticated;
revoke all on function public.finance_create_report(text, public.report_period, date, date, text) from public, anon, authenticated;
revoke all on function public.finance_update_report_draft(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.finance_publish_report(uuid) from public, anon, authenticated;
revoke all on function public.finance_withdraw_report(uuid, text) from public, anon, authenticated;
revoke all on function public.finance_delete_report_draft(uuid) from public, anon, authenticated;
revoke all on function public.get_project_finance(uuid) from public;

grant execute on function public.finance_record_donation(public.ledger_entry_type, date, numeric, uuid, public.payment_method, text, text, uuid, text, text, text, boolean, boolean, boolean, uuid) to authenticated;
grant execute on function public.finance_record_expense(date, numeric, uuid, public.payment_method, text, text, public.expense_category, text, uuid, text, text, boolean, uuid) to authenticated;
grant execute on function public.finance_record_entry(public.ledger_entry_type, date, numeric, text, uuid, public.payment_method, text, uuid, uuid, boolean, uuid) to authenticated;
grant execute on function public.finance_record_transfer(date, numeric, uuid, uuid, public.payment_method, text, text) to authenticated;
grant execute on function public.finance_update_pending_entry(uuid, jsonb) to authenticated;
grant execute on function public.finance_verify_entry(uuid, text, uuid) to authenticated;
grant execute on function public.finance_reject_entry(uuid, text) to authenticated;
grant execute on function public.finance_reverse_entry(uuid, text, date) to authenticated;
grant execute on function public.finance_account_balances(date) to authenticated;
grant execute on function public.finance_period_summary(date, date) to authenticated;
grant execute on function public.finance_reconcile(uuid, date, numeric, text) to authenticated;
grant execute on function public.finance_create_report(text, public.report_period, date, date, text) to authenticated;
grant execute on function public.finance_update_report_draft(uuid, text, text, boolean) to authenticated;
grant execute on function public.finance_publish_report(uuid) to authenticated;
grant execute on function public.finance_withdraw_report(uuid, text) to authenticated;
grant execute on function public.finance_delete_report_draft(uuid) to authenticated;
grant execute on function public.get_project_finance(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Donor self-reports ("I have made a donation") — service role only, via the
-- public-api edge function. Creates a PENDING entry; never verifies anything.
-- -----------------------------------------------------------------------------
create function public.submit_donation_report(
  p_amount numeric,
  p_paid_on date,
  p_payment_method public.payment_method,
  p_transaction_reference text,
  p_donor_name text,
  p_donor_phone text,
  p_donor_email text,
  p_is_anonymous boolean,
  p_acknowledge_publicly boolean,
  p_message text,
  p_client_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_phone text;
  v_email text := nullif(lower(btrim(p_donor_email)), '');
  v_reference text := nullif(upper(btrim(p_transaction_reference)), '');
begin
  if p_payment_method not in ('upi', 'bank_transfer') then
    perform private.fail('invalid:payment_method', 'Online reports are for UPI or bank transfers. For cash or cheque, please contact us.', '22023');
  end if;
  perform private.assert_amount(p_amount);
  if p_paid_on is null or p_paid_on > (now() at time zone 'Asia/Kolkata')::date or p_paid_on < (now() at time zone 'Asia/Kolkata')::date - 365 then
    perform private.fail('invalid:paid_on', 'Enter the date of payment (within the last year).', '22023');
  end if;
  if v_reference is null or char_length(v_reference) not between 6 and 40 or v_reference !~ '^[A-Z0-9/-]+$' then
    perform private.fail('invalid:transaction_reference', 'Enter the UPI reference / UTR number shown in your payment app (letters and numbers).', '22023');
  end if;
  if not coalesce(p_is_anonymous, false) and char_length(btrim(coalesce(p_donor_name, ''))) < 2 then
    perform private.fail('invalid:donor_name', 'Enter your name or choose to donate anonymously.', '22023');
  end if;
  if nullif(btrim(p_donor_phone), '') is not null then
    v_phone := private.normalize_phone(p_donor_phone);
    if v_phone is null then
      perform private.fail('invalid:donor_phone', 'Enter a valid phone number.', '22023');
    end if;
  end if;
  if v_email is not null and not private.is_valid_email(v_email) then
    perform private.fail('invalid:donor_email', 'Enter a valid email address.', '22023');
  end if;
  if v_phone is null and v_email is null then
    perform private.fail('invalid:donor_phone', 'Give a phone number or email so the treasurer can contact you if needed.', '22023');
  end if;
  if char_length(coalesce(p_message, '')) > 500 then
    perform private.fail('invalid:message', 'Message must be 500 characters or fewer.', '22023');
  end if;

  if p_client_submission_id is not null and exists (
    select 1 from public.donations where client_submission_id = p_client_submission_id
  ) then
    return jsonb_build_object('result', 'replayed');
  end if;

  begin
    insert into public.ledger_entries (
      entry_date, entry_type, direction, amount, payment_method, transaction_reference, description, source
    ) values (
      p_paid_on, 'public_donation', 'in', p_amount, p_payment_method, v_reference,
      'Donation reported online by the donor (awaiting verification)', 'public_report'
    )
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('result', 'already_reported');
  end;

  insert into public.donations (
    ledger_entry_id, donor_name, donor_phone, donor_email, is_anonymous, acknowledge_publicly, donor_message,
    client_submission_id
  ) values (
    v_id,
    case when coalesce(p_is_anonymous, false) then null else btrim(p_donor_name) end,
    v_phone, v_email, coalesce(p_is_anonymous, false),
    coalesce(p_acknowledge_publicly, false) and not coalesce(p_is_anonymous, false),
    nullif(btrim(p_message), ''),
    p_client_submission_id
  );

  return jsonb_build_object('result', 'created', 'entry_id', v_id);
end;
$$;

create function public.attach_donation_report_evidence(
  p_entry_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_byte_size integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.ledger_entries
    where id = p_entry_id and source = 'public_report' and status = 'pending'
  ) then
    perform private.fail('not_found', 'Report not found.');
  end if;
  if (select count(*) from public.ledger_evidence where ledger_entry_id = p_entry_id) >= 2 then
    perform private.fail('too_many_files', 'Too many files for this report.');
  end if;
  insert into public.ledger_evidence (ledger_entry_id, storage_path, file_name, mime_type, byte_size, kind, uploaded_by)
  values (p_entry_id, p_storage_path, left(p_file_name, 200), p_mime_type, p_byte_size, 'payment_screenshot', null);
end;
$$;

revoke all on function public.submit_donation_report(numeric, date, public.payment_method, text, text, text, text, boolean, boolean, text, uuid) from public, anon, authenticated;
revoke all on function public.attach_donation_report_evidence(uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.submit_donation_report(numeric, date, public.payment_method, text, text, text, text, boolean, boolean, text, uuid) to service_role;
grant execute on function public.attach_donation_report_evidence(uuid, text, text, text, integer) to service_role;

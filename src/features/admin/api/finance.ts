import { sanitizeSearch, type ReportSnapshot } from '@/lib/api/public';
import { unwrap } from '@/lib/errors';
import type { Enums, Json, Tables, TablesInsert } from '@/types/database';
import { db } from '../components/db';

export type Account = Tables<'financial_accounts'>;
export type Entry = Tables<'ledger_entries'>;

// ---------------------------------------------------------------- accounts
export async function listAccounts() {
  return (unwrap(await db().from('financial_accounts').select('*').order('is_active', { ascending: false }).order('name')) ?? []) as Account[];
}

export async function saveAccount(id: string | null, values: Pick<TablesInsert<'financial_accounts'>, 'name' | 'account_type' | 'description' | 'is_active'>) {
  if (id) unwrap(await db().from('financial_accounts').update(values).eq('id', id));
  else unwrap(await db().from('financial_accounts').insert(values));
}

export type Balance = {
  account_id: string;
  name: string;
  account_type: Enums<'account_type'>;
  is_active: boolean;
  balance: number;
  pending_in: number;
  pending_out: number;
  pending_count: number;
  locked_through: string | null;
  last_reconciled_on: string | null;
  last_difference: number | null;
};

export async function accountBalances(asOf?: string) {
  return (unwrap(await db().rpc('finance_account_balances', asOf ? { p_as_of: asOf } : {})) ?? []) as unknown as Balance[];
}

// ---------------------------------------------------------------- entries
export type EntryListRow = Entry & {
  account: { name: string } | null;
  project: { title: string } | null;
  donation: { donor_name: string | null; is_anonymous: boolean; receipt_number: string | null } | null;
  expense: { payee_name: string } | null;
  recorder: { full_name: string } | null;
};

const ENTRY_LIST_COLUMNS = `*,
  account:financial_accounts(name),
  project:projects(title),
  donation:donations(donor_name, is_anonymous, receipt_number),
  expense:expenses(payee_name),
  recorder:profiles!ledger_entries_recorded_by_fkey(full_name)`;

export type EntryFilters = {
  status?: Enums<'ledger_status'> | '';
  type?: Enums<'ledger_entry_type'> | '';
  accountId?: string;
  from?: string;
  to?: string;
  search?: string;
  page: number;
  pageSize: number;
};

export async function listEntries(f: EntryFilters) {
  let q = db()
    .from('ledger_entries')
    .select(ENTRY_LIST_COLUMNS, { count: 'exact' })
    .order('entry_date', { ascending: false })
    .order('entry_no', { ascending: false })
    .range((f.page - 1) * f.pageSize, f.page * f.pageSize - 1);
  if (f.status) q = q.eq('status', f.status);
  if (f.type) q = q.eq('entry_type', f.type);
  if (f.accountId) q = q.eq('account_id', f.accountId);
  if (f.from) q = q.gte('entry_date', f.from);
  if (f.to) q = q.lte('entry_date', f.to);
  const s = f.search ? sanitizeSearch(f.search) : '';
  if (s) {
    const num = s.replace(/^txn-?/i, '').replace(/^0+/, '');
    const parts = [`description.ilike.%${s}%`, `transaction_reference.ilike.%${s.replace(/\s/g, '')}%`];
    if (/^\d+$/.test(num)) parts.push(`entry_no.eq.${num}`);
    q = q.or(parts.join(','));
  }
  const res = await q;
  return { rows: (unwrap(res) ?? []) as unknown as EntryListRow[], count: res.count ?? 0 };
}

export async function listPendingEntries() {
  return (unwrap(
    await db().from('ledger_entries').select(ENTRY_LIST_COLUMNS).eq('status', 'pending').order('entry_date').order('entry_no').limit(100),
  ) ?? []) as unknown as EntryListRow[];
}

export type EntryDetail = Entry & {
  account: { id: string; name: string } | null;
  project: { id: string; title: string } | null;
  recorder: { full_name: string } | null;
  editor: { full_name: string } | null;
  verifier: { full_name: string } | null;
  rejecter: { full_name: string } | null;
};

export async function getEntry(id: string) {
  const client = db();
  const entryRes = await client
    .from('ledger_entries')
    .select(`*,
      account:financial_accounts(id, name),
      project:projects(id, title),
      recorder:profiles!ledger_entries_recorded_by_fkey(full_name),
      editor:profiles!ledger_entries_last_edited_by_fkey(full_name),
      verifier:profiles!ledger_entries_verified_by_fkey(full_name),
      rejecter:profiles!ledger_entries_rejected_by_fkey(full_name)`)
    .eq('id', id)
    .maybeSingle();
  const entry = unwrap(entryRes) as unknown as EntryDetail | null;
  if (!entry) return null;
  const linkedIds = [entry.reverses_entry_id, entry.replaces_entry_id, entry.related_entry_id].filter(Boolean) as string[];
  const [donation, expense, evidence, reversals, replacements, linked, legs, history] = await Promise.all([
    client.from('donations').select('*').eq('ledger_entry_id', id).maybeSingle(),
    client.from('expenses').select('*, request:assistance_requests(reference_code)').eq('ledger_entry_id', id).maybeSingle(),
    client.from('ledger_evidence').select('*, uploader:profiles(full_name)').eq('ledger_entry_id', id).order('created_at'),
    client.from('ledger_entries').select('id, entry_no, status, entry_date').eq('reverses_entry_id', id),
    client.from('ledger_entries').select('id, entry_no, status, entry_date').eq('replaces_entry_id', id),
    linkedIds.length
      ? client.from('ledger_entries').select('id, entry_no, status, entry_type, entry_date, amount').in('id', linkedIds)
      : Promise.resolve({ data: [], error: null }),
    entry.transfer_group_id
      ? client.from('ledger_entries').select('id, entry_no, direction, account:financial_accounts(name)').eq('transfer_group_id', entry.transfer_group_id)
      : Promise.resolve({ data: [], error: null }),
    client.from('activity_logs').select('id, occurred_at, action, actor_id, changes').eq('entity_type', 'ledger_entries').eq('entity_id', id).order('id'),
  ]);
  return {
    entry,
    donation: unwrap(donation) as Tables<'donations'> | null,
    expense: unwrap(expense) as (Tables<'expenses'> & { request: { reference_code: string } | null }) | null,
    evidence: (unwrap(evidence) ?? []) as unknown as Array<Tables<'ledger_evidence'> & { uploader: { full_name: string } | null }>,
    reversals: (unwrap(reversals) ?? []) as Array<Pick<Entry, 'id' | 'entry_no' | 'status' | 'entry_date'>>,
    replacements: (unwrap(replacements) ?? []) as Array<Pick<Entry, 'id' | 'entry_no' | 'status' | 'entry_date'>>,
    linked: (unwrap(linked) ?? []) as Array<Pick<Entry, 'id' | 'entry_no' | 'status' | 'entry_type' | 'entry_date' | 'amount'>>,
    legs: (unwrap(legs) ?? []) as unknown as Array<{ id: string; entry_no: number; direction: Enums<'ledger_direction'>; account: { name: string } | null }>,
    history: (unwrap(history) ?? []) as Array<{ id: number; occurred_at: string; action: string; actor_id: string | null; changes: Json }>,
  };
}

export type DonationInput = {
  entry_type: 'member_contribution' | 'public_donation';
  entry_date: string;
  amount: number;
  account_id: string;
  payment_method: Enums<'payment_method'>;
  transaction_reference: string;
  description: string;
  project_id: string | null;
  donor_name: string;
  donor_phone: string;
  donor_email: string;
  is_anonymous: boolean;
  acknowledge_publicly: boolean;
};

export async function recordDonation(v: DonationInput, allowDuplicate: boolean, replacesId: string | null) {
  return unwrap(
    await db().rpc('finance_record_donation', {
      p_entry_type: v.entry_type,
      p_entry_date: v.entry_date,
      p_amount: v.amount,
      p_account_id: v.account_id,
      p_payment_method: v.payment_method,
      p_transaction_reference: v.transaction_reference || null,
      p_description: v.description,
      p_project_id: v.project_id,
      p_donor_name: v.donor_name || null,
      p_donor_phone: v.donor_phone || null,
      p_donor_email: v.donor_email || null,
      p_is_anonymous: v.is_anonymous,
      p_acknowledge_publicly: v.acknowledge_publicly,
      p_allow_possible_duplicate: allowDuplicate,
      p_replaces_entry_id: replacesId,
    }),
  ) as string;
}

export type ExpenseInput = {
  entry_date: string;
  amount: number;
  account_id: string;
  payment_method: Enums<'payment_method'>;
  transaction_reference: string;
  description: string;
  expense_category: Enums<'expense_category'>;
  payee_name: string;
  project_id: string | null;
  bill_reference: string;
  assistance_reference: string;
};

export async function recordExpense(v: ExpenseInput, allowDuplicate: boolean, replacesId: string | null) {
  return unwrap(
    await db().rpc('finance_record_expense', {
      p_entry_date: v.entry_date,
      p_amount: v.amount,
      p_account_id: v.account_id,
      p_payment_method: v.payment_method,
      p_transaction_reference: v.transaction_reference || null,
      p_description: v.description,
      p_expense_category: v.expense_category,
      p_payee_name: v.payee_name,
      p_project_id: v.project_id,
      p_bill_reference: v.bill_reference || null,
      p_assistance_reference: v.assistance_reference || null,
      p_allow_possible_duplicate: allowDuplicate,
      p_replaces_entry_id: replacesId,
    }),
  ) as string;
}

export type OtherInput = {
  entry_type: 'opening_balance' | 'other_income' | 'refund' | 'allocation';
  entry_date: string;
  amount: number;
  description: string;
  account_id: string | null;
  payment_method: Enums<'payment_method'> | null;
  transaction_reference: string;
  project_id: string | null;
  related_entry_id: string | null;
};

export async function recordOther(v: OtherInput, allowDuplicate: boolean, replacesId: string | null) {
  return unwrap(
    await db().rpc('finance_record_entry', {
      p_entry_type: v.entry_type,
      p_entry_date: v.entry_date,
      p_amount: v.amount,
      p_description: v.description,
      p_account_id: v.account_id,
      p_payment_method: v.payment_method,
      p_transaction_reference: v.transaction_reference || null,
      p_project_id: v.project_id,
      p_related_entry_id: v.related_entry_id,
      p_allow_possible_duplicate: allowDuplicate,
      p_replaces_entry_id: replacesId,
    }),
  ) as string;
}

export async function recordTransfer(v: {
  entry_date: string;
  amount: number;
  from_account_id: string;
  to_account_id: string;
  payment_method: Enums<'payment_method'>;
  transaction_reference: string;
  description: string;
}) {
  const group = unwrap(
    await db().rpc('finance_record_transfer', {
      p_entry_date: v.entry_date,
      p_amount: v.amount,
      p_from_account_id: v.from_account_id,
      p_to_account_id: v.to_account_id,
      p_payment_method: v.payment_method,
      p_transaction_reference: v.transaction_reference || null,
      p_description: v.description,
    }),
  ) as string;
  const legs = unwrap(await db().from('ledger_entries').select('id').eq('transfer_group_id', group).eq('direction', 'out').limit(1));
  return (legs?.[0]?.id as string) ?? '';
}

export async function updatePendingEntry(id: string, changes: Record<string, unknown>) {
  unwrap(await db().rpc('finance_update_pending_entry', { p_entry_id: id, p_changes: changes as Json }));
}

export async function verifyEntry(id: string, note: string, accountId?: string | null) {
  return unwrap(await db().rpc('finance_verify_entry', { p_entry_id: id, p_note: note || null, p_account_id: accountId ?? null })) as {
    verified: string[];
    receipt_number: string | null;
  };
}

export async function rejectEntry(id: string, reason: string) {
  unwrap(await db().rpc('finance_reject_entry', { p_entry_id: id, p_reason: reason }));
}

export async function reverseEntry(id: string, reason: string, date: string) {
  return unwrap(await db().rpc('finance_reverse_entry', { p_entry_id: id, p_reason: reason, p_entry_date: date })) as string;
}

export async function uploadEvidence(entryId: string, file: File, kind: Enums<'evidence_kind'>, userId: string) {
  const allowed: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const ext = allowed[file.type];
  if (!ext) throw new Error('Upload a PDF, JPG, PNG or WebP file.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Files must be 10 MB or smaller.');
  const path = `entries/${entryId}/${crypto.randomUUID()}.${ext}`;
  const client = db();
  const { error: upErr } = await client.storage.from('finance-evidence').upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
  const { error } = await client.from('ledger_evidence').insert({
    ledger_entry_id: entryId,
    storage_path: path,
    file_name: file.name.slice(0, 200),
    mime_type: file.type,
    byte_size: file.size,
    kind,
    uploaded_by: userId,
  });
  if (error) {
    await client.storage.from('finance-evidence').remove([path]);
    throw new Error(`The file could not be attached: ${error.message}`);
  }
}

export async function evidenceUrl(path: string) {
  const { data, error } = await db().storage.from('finance-evidence').createSignedUrl(path, 120);
  if (error || !data) throw new Error('The file could not be opened.');
  return data.signedUrl;
}

export async function removeEvidence(ev: Tables<'ledger_evidence'>) {
  unwrap(await db().from('ledger_evidence').delete().eq('id', ev.id));
  await db().storage.from('finance-evidence').remove([ev.storage_path]);
}

// ---------------------------------------------------------------- reconciliation
export async function reconcile(accountId: string, statementDate: string, statementBalance: number, notes: string) {
  return unwrap(
    await db().rpc('finance_reconcile', {
      p_account_id: accountId,
      p_statement_date: statementDate,
      p_statement_balance: statementBalance,
      p_notes: notes || null,
    }),
  ) as Tables<'reconciliations'>;
}

export async function listReconciliations(accountId?: string) {
  let q = db()
    .from('reconciliations')
    .select('*, account:financial_accounts(name), performer:profiles(full_name)')
    .order('statement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);
  if (accountId) q = q.eq('account_id', accountId);
  return (unwrap(await q) ?? []) as unknown as Array<Tables<'reconciliations'> & { account: { name: string } | null; performer: { full_name: string } | null }>;
}

// ---------------------------------------------------------------- summaries & reports
export type PeriodSummary = Omit<ReportSnapshot, 'projects' | 'other_project_expenditure'> & {
  accounts: Array<{ account_id: string; name: string; opening: number; inflow: number; outflow: number; closing: number }>;
  projects: Array<{ project_id: string; title: string; is_published: boolean; allocated: number; restricted_income: number; expenditure_in_period: number; expenditure_to_date: number }>;
  pending: { count: number; amount_in: number; amount_out: number };
};

export async function periodSummary(start: string, end: string) {
  return unwrap(await db().rpc('finance_period_summary', { p_start: start, p_end: end })) as unknown as PeriodSummary;
}

export type Report = Tables<'financial_reports'> & {
  preparer: { full_name: string } | null;
  approver: { full_name: string } | null;
};

export async function listReports() {
  return (unwrap(
    await db()
      .from('financial_reports')
      .select('*, preparer:profiles!financial_reports_prepared_by_fkey(full_name), approver:profiles!financial_reports_approved_by_fkey(full_name)')
      .order('period_end', { ascending: false })
      .order('created_at', { ascending: false }),
  ) ?? []) as unknown as Report[];
}

export async function getReport(id: string) {
  const client = db();
  const [report, docs] = await Promise.all([
    client
      .from('financial_reports')
      .select('*, preparer:profiles!financial_reports_prepared_by_fkey(full_name), approver:profiles!financial_reports_approved_by_fkey(full_name)')
      .eq('id', id)
      .maybeSingle(),
    client.from('financial_report_documents').select('*').eq('report_id', id).order('created_at'),
  ]);
  return { report: unwrap(report) as unknown as Report | null, documents: (unwrap(docs) ?? []) as Tables<'financial_report_documents'>[] };
}

export async function createReport(title: string, periodType: Enums<'report_period'>, start: string, end: string) {
  return unwrap(await db().rpc('finance_create_report', { p_title: title, p_period_type: periodType, p_start: start, p_end: end, p_narrative: '' })) as string;
}

export async function updateReportDraft(id: string, title: string, narrative: string, refresh: boolean) {
  unwrap(await db().rpc('finance_update_report_draft', { p_report_id: id, p_title: title, p_narrative: narrative, p_refresh_snapshot: refresh }));
}

export async function publishReport(id: string) {
  unwrap(await db().rpc('finance_publish_report', { p_report_id: id }));
}

export async function withdrawReport(id: string, reason: string) {
  unwrap(await db().rpc('finance_withdraw_report', { p_report_id: id, p_reason: reason }));
}

export async function deleteReportDraft(id: string) {
  unwrap(await db().rpc('finance_delete_report_draft', { p_report_id: id }));
}

export async function uploadReportDocument(reportId: string, file: File, title: string, userId: string) {
  if (file.type !== 'application/pdf') throw new Error('Report documents must be PDF files.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Report documents must be 20 MB or smaller.');
  const safe = file.name.replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'document';
  const path = `reports/${reportId}/${safe}-${crypto.randomUUID().slice(0, 8)}.pdf`;
  const client = db();
  const { error: upErr } = await client.storage.from('report-documents').upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
  const { error } = await client.from('financial_report_documents').insert({
    report_id: reportId,
    title,
    storage_path: path,
    mime_type: 'application/pdf',
    byte_size: file.size,
    redaction_confirmed: true,
    uploaded_by: userId,
  });
  if (error) {
    await client.storage.from('report-documents').remove([path]);
    throw new Error(`The document could not be attached: ${error.message}`);
  }
}

export async function removeReportDocument(doc: Tables<'financial_report_documents'>) {
  unwrap(await db().from('financial_report_documents').delete().eq('id', doc.id));
  await db().storage.from('report-documents').remove([doc.storage_path]);
}

export async function reportDocumentStaffUrl(path: string) {
  const { data, error } = await db().storage.from('report-documents').createSignedUrl(path, 120);
  if (error || !data) throw new Error('The document could not be opened.');
  return data.signedUrl;
}

export async function financeControls() {
  const rows = unwrap(await db().from('site_settings').select('value').eq('key', 'finance.controls').limit(1));
  const v = (rows?.[0]?.value ?? {}) as { require_independent_verification?: boolean; require_independent_report_approval?: boolean };
  return { independentVerification: v.require_independent_verification !== false, independentApproval: v.require_independent_report_approval !== false };
}

export function entryLabel(no: number) {
  return `TXN-${String(no).padStart(6, '0')}`;
}

/** Signed amount for display: inflows positive, outflows negative, internal allocations unsigned. */
export function signedAmount(e: Pick<Entry, 'direction' | 'amount'>) {
  return e.direction === 'out' ? -Number(e.amount) : Number(e.amount);
}

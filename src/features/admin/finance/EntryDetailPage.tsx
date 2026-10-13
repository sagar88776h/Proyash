import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCheck2, Paperclip, Printer, RotateCcw, ShieldCheck, Trash2, Upload, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Alert, Badge, EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { LoadingBlock } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/useAuth';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, formatINR, todayISO } from '@/lib/format';
import { ENTRY_TYPE_LABELS, EVIDENCE_KIND_LABELS, EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/labels';
import type { Enums } from '@/types/database';
import {
  entryLabel,
  evidenceUrl,
  financeControls,
  getEntry,
  listAccounts,
  rejectEntry,
  removeEvidence,
  reverseEntry,
  updatePendingEntry,
  uploadEvidence,
  verifyEntry,
} from '../api/finance';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Card, KeyValue, PageHeader } from '../components/PageHeader';
import { LedgerStatusBadge } from '../components/StatusBadges';
import { useToast } from '../components/useToast';
import { Amount } from './shared';

function EvidenceUploader({ entryId, onUploaded }: { entryId: string; onUploaded: () => void }) {
  const auth = useAuth();
  const toast = useToast();
  const [kind, setKind] = useState<Enums<'evidence_kind'>>('receipt');
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field id="ev-kind" label="Document type">
        <Select value={kind} onChange={(e) => setKind(e.target.value as Enums<'evidence_kind'>)} className="w-56">
          {Object.entries(EVIDENCE_KIND_LABELS).filter(([k]) => k !== 'payment_screenshot').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-forest-700 px-5 text-sm font-medium text-ivory-50 hover:bg-forest-800 focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-forest-700">
        <Upload aria-hidden="true" className="size-4" /> {busy ? 'Uploading…' : 'Attach file'}
        <input
          type="file"
          className="sr-only"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file || !auth.userId) return;
            setBusy(true);
            try {
              await uploadEvidence(entryId, file, kind, auth.userId);
              toast.success('Evidence attached.');
              onUploaded();
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
    </div>
  );
}

function VerifyDialog({ open, onClose, needsAccount, onConfirm }: { open: boolean; onClose: () => void; needsAccount: boolean; onConfirm: (note: string, accountId: string | null) => Promise<void> }) {
  const accounts = useQuery({ queryKey: ['admin', 'finance', 'accounts'], queryFn: listAccounts, enabled: needsAccount });
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Verify this entry"
      description="Confirm you have checked it against an independent record. Verified entries can never be edited or deleted."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            iconLeft={<ShieldCheck aria-hidden="true" className="size-4" />}
            disabled={needsAccount && !accountId}
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                await onConfirm(note.trim(), needsAccount ? accountId : null);
                onClose();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Verify
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {needsAccount && (
          <Field id="vf-account" label="Account the payment was received into" required>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Choose…</option>
              {(accounts.data ?? []).filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        )}
        <Field id="vf-note" label="How did you verify it?" hint="e.g. “Matched to bank statement, 12 Oct, line 4”. Required unless an independent document (not a donor screenshot) is attached.">
          <Textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Alert tone="danger" live="assertive">{error}</Alert>}
      </div>
    </Dialog>
  );
}

function EditDialog({ open, onClose, entry, onSave }: { open: boolean; onClose: () => void; entry: { entry_date: string; amount: number; transaction_reference: string | null; description: string }; onSave: (changes: Record<string, unknown>) => Promise<void> }) {
  const [v, setV] = useState({ entry_date: entry.entry_date, amount: String(entry.amount), transaction_reference: entry.transaction_reference ?? '', description: entry.description });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit pending entry"
      description="Editing makes you responsible for the entry: someone else must verify it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                await onSave({ entry_date: v.entry_date, amount: Number(v.amount), transaction_reference: v.transaction_reference, description: v.description });
                onClose();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ed-date" label="Date"><Input type="date" max={todayISO()} value={v.entry_date} onChange={(e) => setV({ ...v, entry_date: e.target.value })} /></Field>
        <Field id="ed-amount" label="Amount (₹)"><Input inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></Field>
        <Field id="ed-ref" label="Payment reference" className="sm:col-span-2"><Input value={v.transaction_reference} onChange={(e) => setV({ ...v, transaction_reference: e.target.value })} /></Field>
        <Field id="ed-desc" label="Description" className="sm:col-span-2"><Input value={v.description} maxLength={500} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        {error && <Alert tone="danger" live="assertive" className="sm:col-span-2">{error}</Alert>}
      </div>
    </Dialog>
  );
}

export function EntryDetailPage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'finance', 'entry', id], queryFn: () => getEntry(id) });
  const controls = useQuery({ queryKey: ['admin', 'finance', 'controls'], queryFn: financeControls });
  const [dialog, setDialog] = useState<'verify' | 'reject' | 'reverse' | 'edit' | null>(null);
  const [reverseDate, setReverseDate] = useState(todayISO());

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
  };

  if (query.isLoading) return <LoadingBlock label="Loading entry" />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  if (!query.data) return <EmptyState title="Entry not found" />;
  const { entry: e, donation, expense, evidence, reversals, replacements, linked, legs, history } = query.data;
  const pending = e.status === 'pending';
  const verified = e.status === 'verified';
  const isMine = e.recorded_by === auth.userId || e.last_edited_by === auth.userId;
  const fourEyesBlocks = (controls.data?.independentVerification ?? true) && isMine;
  const liveReversal = reversals.find((r) => r.status !== 'rejected');
  const original = linked.find((l) => l.id === e.reverses_entry_id);
  const replaced = linked.find((l) => l.id === e.replaces_entry_id);
  const related = linked.find((l) => l.id === e.related_entry_id);
  const kindForReplacement = e.entry_type === 'expense' ? 'expense' : e.entry_type === 'member_contribution' || e.entry_type === 'public_donation' ? 'donation' : 'other';

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{entryLabel(e.entry_no)}</span>}
        documentTitle={entryLabel(e.entry_no)}
        back={{ to: '/admin/finance/ledger', label: 'Ledger' }}
        meta={
          <>
            <LedgerStatusBadge status={e.status} />
            <span>{ENTRY_TYPE_LABELS[e.entry_type]}</span>
            <span>· {formatDate(e.entry_date)}</span>
            {e.source === 'public_report' && <Badge tone="gold">Reported by donor</Badge>}
            {liveReversal && <Badge tone="danger">Reversed</Badge>}
          </>
        }
        actions={
          <>
            {pending && (
              <>
                <Button onClick={() => setDialog('verify')} disabled={fourEyesBlocks} iconLeft={<ShieldCheck aria-hidden="true" className="size-4" />}>Verify</Button>
                <Button variant="secondary" onClick={() => setDialog('reject')} iconLeft={<XCircle aria-hidden="true" className="size-4" />}>Reject</Button>
                {e.entry_type !== 'transfer' && e.entry_type !== 'reversal' && <Button variant="ghost" onClick={() => setDialog('edit')}>Edit</Button>}
              </>
            )}
            {verified && !liveReversal && e.entry_type !== 'reversal' && (
              <Button variant="secondary" onClick={() => setDialog('reverse')} iconLeft={<RotateCcw aria-hidden="true" className="size-4" />}>Reverse (correct)</Button>
            )}
            {verified && donation?.receipt_number && (
              <ButtonLink to={`/admin/finance/entries/${e.id}/receipt`} variant="ghost" iconLeft={<Printer aria-hidden="true" className="size-4" />}>Receipt</ButtonLink>
            )}
          </>
        }
      />
      {pending && fourEyesBlocks && (
        <Alert tone="info" className="mb-6">You recorded or edited this entry, so another treasurer or administrator must verify it.</Alert>
      )}
      {e.source === 'public_report' && pending && (
        <Alert tone="warning" className="mb-6" title="Donor self-report">
          Find this payment on the organisation’s bank statement before verifying. The donor’s screenshot is not proof of payment.
        </Alert>
      )}
      {e.status === 'rejected' && (
        <Alert tone="danger" className="mb-6" title="Rejected">
          {e.rejection_reason} — by {e.rejecter?.full_name || 'team member'} on {formatDateTime(e.rejected_at)}
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card title="Transaction">
            <div className="mb-5"><Amount value={Number(e.amount)} direction={e.direction} className="font-display text-3xl" /></div>
            <KeyValue
              items={[
                { label: 'Description', value: e.description },
                { label: 'Account', value: e.account?.name ?? (e.direction === 'internal' ? 'Allocation (no account)' : <Badge tone="warning">To be assigned at verification</Badge>) },
                { label: 'Payment method', value: e.payment_method ? PAYMENT_METHOD_LABELS[e.payment_method] : '—' },
                { label: 'Payment reference', value: e.transaction_reference ?? '—' },
                { label: 'Project', value: e.project ? <Link to={`/admin/projects/${e.project.id}`} className="text-forest-700 hover:underline">{e.project.title}</Link> : '—' },
                { label: 'Expense category', value: e.expense_category ? EXPENSE_CATEGORY_LABELS[e.expense_category] : '—', hidden: !e.expense_category },
                { label: 'Correction reason', value: e.correction_reason, hidden: !e.correction_reason },
              ]}
            />
          </Card>
          {donation && (
            <Card title={e.entry_type === 'member_contribution' ? 'Member' : 'Donor'}>
              <KeyValue
                items={[
                  { label: 'Name', value: donation.is_anonymous ? 'Anonymous' : donation.donor_name },
                  { label: 'Phone', value: donation.donor_phone ?? '—' },
                  { label: 'Email', value: donation.donor_email ?? '—' },
                  { label: 'Public thanks', value: donation.acknowledge_publicly ? 'Agreed' : 'Not agreed' },
                  { label: 'Receipt number', value: donation.receipt_number ?? 'Issued on verification' },
                  { label: 'Message', value: donation.donor_message, hidden: !donation.donor_message },
                ]}
              />
            </Card>
          )}
          {expense && (
            <Card title="Payee">
              <KeyValue
                items={[
                  { label: 'Paid to', value: expense.payee_name },
                  { label: 'Bill / invoice', value: expense.bill_reference ?? '—' },
                  { label: 'Assistance request', value: expense.request?.reference_code ?? '—' },
                ]}
              />
            </Card>
          )}
          <Card title={<span className="flex items-center gap-2"><Paperclip aria-hidden="true" className="size-4" /> Supporting evidence</span>}>
            {evidence.length ? (
              <ul className="mb-5 flex flex-col divide-y divide-ink-100">
                {evidence.map((ev) => (
                  <li key={ev.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 font-medium text-forest-700 hover:underline"
                        onClick={async () => {
                          try {
                            window.open(await evidenceUrl(ev.storage_path), '_blank', 'noopener');
                          } catch (err) {
                            toast.error(errorMessage(err));
                          }
                        }}
                      >
                        <FileCheck2 aria-hidden="true" className="size-4" /> {ev.file_name}
                      </button>
                      <p className="text-xs text-ink-600">
                        {EVIDENCE_KIND_LABELS[ev.kind]} · {ev.uploader?.full_name ?? 'Donor'} · {formatDateTime(ev.created_at)}
                      </p>
                    </div>
                    {pending && (
                      <Button size="sm" variant="ghost" aria-label={`Remove ${ev.file_name}`} onClick={async () => { try { await removeEvidence(ev); refresh(); toast.success('Removed.'); } catch (err) { toast.error(errorMessage(err)); } }}>
                        <Trash2 aria-hidden="true" className="size-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-5 text-sm text-ink-600">No evidence attached yet.{['expense', 'refund', 'opening_balance'].includes(e.entry_type) ? ' This entry cannot be verified without evidence.' : ''}</p>
            )}
            {e.status !== 'rejected' && <EvidenceUploader entryId={e.id} onUploaded={refresh} />}
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card title="Responsibility">
            <KeyValue
              columns={1}
              items={[
                { label: 'Recorded', value: `${e.source === 'public_report' ? 'Donor (online report)' : e.recorder?.full_name || 'Team member'} · ${formatDateTime(e.recorded_at)}` },
                { label: 'Last edited', value: e.last_edited_at ? `${e.editor?.full_name || 'Team member'} · ${formatDateTime(e.last_edited_at)}` : '—', hidden: !e.last_edited_at },
                { label: 'Verified', value: e.verified_at ? `${e.verifier?.full_name || 'Team member'} · ${formatDateTime(e.verified_at)}` : 'Not yet verified' },
                { label: 'Verification note', value: e.verification_note, hidden: !e.verification_note },
              ]}
            />
          </Card>
          {(original || replaced || related || reversals.length > 0 || replacements.length > 0 || legs.length > 0) && (
            <Card title="Linked entries">
              <ul className="flex flex-col gap-2 text-sm">
                {original && <li>Reverses <Link className="font-mono text-forest-700 hover:underline" to={`/admin/finance/entries/${original.id}`}>{entryLabel(original.entry_no)}</Link></li>}
                {replaced && <li>Corrected replacement of <Link className="font-mono text-forest-700 hover:underline" to={`/admin/finance/entries/${replaced.id}`}>{entryLabel(replaced.entry_no)}</Link></li>}
                {related && <li>Refund of <Link className="font-mono text-forest-700 hover:underline" to={`/admin/finance/entries/${related.id}`}>{entryLabel(related.entry_no)}</Link> ({formatINR(related.amount)})</li>}
                {reversals.map((r) => (
                  <li key={r.id}>Reversed by <Link className="font-mono text-forest-700 hover:underline" to={`/admin/finance/entries/${r.id}`}>{entryLabel(r.entry_no)}</Link> <LedgerStatusBadge status={r.status} /></li>
                ))}
                {replacements.map((r) => (
                  <li key={r.id}>Replaced by <Link className="font-mono text-forest-700 hover:underline" to={`/admin/finance/entries/${r.id}`}>{entryLabel(r.entry_no)}</Link> <LedgerStatusBadge status={r.status} /></li>
                ))}
                {legs.filter((l) => l.id !== e.id).map((l) => (
                  <li key={l.id}>Other side of transfer: <Link className="font-mono text-forest-700 hover:underline" to={`/admin/finance/entries/${l.id}`}>{entryLabel(l.entry_no)}</Link> ({l.direction === 'in' ? 'into' : 'out of'} {l.account?.name})</li>
                ))}
              </ul>
              {liveReversal && replacements.length === 0 && e.entry_type !== 'transfer' && (
                <ButtonLink to={`/admin/finance/new?replaces=${e.id}&no=${e.entry_no}&kind=${kindForReplacement}`} size="sm" variant="secondary" className="mt-4">
                  Record the corrected entry
                </ButtonLink>
              )}
            </Card>
          )}
          <Card title="Change history">
            <ol className="flex flex-col gap-3 text-sm">
              {history.map((h) => {
                const fields = (h.changes as { fields?: string[] }).fields;
                return (
                  <li key={h.id} className="border-l-2 border-forest-200 pl-3">
                    <p className="font-medium capitalize">{h.action === 'insert' ? 'Recorded' : h.action === 'update' ? 'Updated' : h.action}</p>
                    <p className="text-xs text-ink-600">{formatDateTime(h.occurred_at)}</p>
                    {fields && <p className="text-xs text-ink-700">Changed: {fields.join(', ')}</p>}
                  </li>
                );
              })}
            </ol>
            <Link to={`/admin/audit?entity=ledger_entries&id=${e.id}`} className="mt-3 inline-block text-sm text-forest-700 hover:underline">Full audit details</Link>
          </Card>
        </div>
      </div>

      <VerifyDialog
        open={dialog === 'verify'}
        onClose={() => setDialog(null)}
        needsAccount={!e.account_id && e.direction !== 'internal'}
        onConfirm={async (note, accountId) => {
          const res = await verifyEntry(e.id, note, accountId);
          refresh();
          toast.success(res.receipt_number ? `Verified. Receipt ${res.receipt_number} issued.` : 'Entry verified.');
        }}
      />
      <ConfirmDialog
        open={dialog === 'reject'}
        onClose={() => setDialog(null)}
        tone="danger"
        title="Reject this entry?"
        description="Rejected entries stay in the ledger for the record but never count towards balances."
        confirmLabel="Reject entry"
        reason={{ label: 'Reason', required: true, minLength: 5 }}
        onConfirm={async (reason) => {
          await rejectEntry(e.id, reason);
          refresh();
          toast.success('Entry rejected.');
        }}
      />
      <ConfirmDialog
        open={dialog === 'reverse'}
        onClose={() => setDialog(null)}
        title="Reverse this entry"
        description="Creates a pending reversal that cancels this entry once verified. You can then record the corrected entry. Nothing is deleted."
        confirmLabel="Create reversal"
        reason={{ label: 'What was wrong?', required: true, minLength: 5 }}
        onConfirm={async (reason) => {
          const rid = await reverseEntry(e.id, reason, reverseDate);
          refresh();
          toast.success('Reversal recorded as pending.');
          navigate(`/admin/finance/entries/${rid}`);
        }}
      >
        <Field id="rev-date" label="Date of the reversal" hint="Usually today. It cannot be in a reconciled (closed) period.">
          <Input type="date" max={todayISO()} value={reverseDate} onChange={(ev) => setReverseDate(ev.target.value)} />
        </Field>
      </ConfirmDialog>
      {dialog === 'edit' && (
        <EditDialog
          open
          onClose={() => setDialog(null)}
          entry={{ entry_date: e.entry_date, amount: Number(e.amount), transaction_reference: e.transaction_reference, description: e.description }}
          onSave={async (changes) => {
            await updatePendingEntry(e.id, changes);
            refresh();
            toast.success('Entry updated.');
          }}
        />
      )}
    </>
  );
}

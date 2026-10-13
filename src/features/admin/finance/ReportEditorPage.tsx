import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileText, RefreshCw, Send, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Checkbox, Field, Input } from '@/components/ui/Field';
import { LoadingBlock } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/useAuth';
import type { ReportSnapshot } from '@/lib/api/public';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, formatINR } from '@/lib/format';
import { EXPENSE_CATEGORY_LABELS } from '@/lib/labels';
import type { Enums } from '@/types/database';
import {
  deleteReportDraft,
  financeControls,
  getReport,
  publishReport,
  removeReportDocument,
  reportDocumentStaffUrl,
  updateReportDraft,
  uploadReportDocument,
  withdrawReport,
} from '../api/finance';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MarkdownField } from '../components/MarkdownField';
import { Card, PageHeader } from '../components/PageHeader';
import { ReportStatusBadge } from '../components/StatusBadges';
import { useToast } from '../components/useToast';

function Snapshot({ s }: { s: ReportSnapshot }) {
  const income = Number(s.income.member_contributions) + Number(s.income.public_donations) + Number(s.income.other_income);
  const rows: Array<[string, number]> = [
    ['Opening balance', Number(s.opening_balance)],
    ['Received', income],
    ...(Object.entries(s.expenditure_by_category ?? {}) as Array<[Enums<'expense_category'>, number]>).map(([k, v]) => [`Spent: ${EXPENSE_CATEGORY_LABELS[k]}`, Number(v)] as [string, number]),
    ['Refunds', Number(s.refunds)],
    ['Closing balance', Number(s.closing_balance)],
  ];
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Figures frozen in this report</caption>
      <tbody>
        {rows.map(([l, v]) => (
          <tr key={l} className="border-b border-ink-100 last:border-0"><th scope="row" className="py-2 text-left font-normal text-ink-700">{l}</th><td className="text-right tabular-nums">{formatINR(v)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReportEditorPage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'finance', 'report', id], queryFn: () => getReport(id) });
  const controls = useQuery({ queryKey: ['admin', 'finance', 'controls'], queryFn: financeControls });
  const [draft, setDraft] = useState<{ title: string; narrative: string } | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [redacted, setRedacted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dialog, setDialog] = useState<'publish' | 'withdraw' | 'delete' | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });

  if (query.isLoading) return <LoadingBlock />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const r = query.data?.report;
  if (!r) return <EmptyState title="Report not found" />;
  const docs = query.data!.documents;
  const isDraft = r.status === 'draft';
  const preparedByMe = r.prepared_by === auth.userId;
  const approvalBlocked = (controls.data?.independentApproval ?? true) && preparedByMe;
  const values = draft ?? { title: r.title, narrative: r.narrative };

  const save = async (refreshSnapshot: boolean) => {
    try {
      await updateReportDraft(r.id, values.title, values.narrative, refreshSnapshot);
      setDraft(null);
      refresh();
      toast.success(refreshSnapshot ? 'Figures refreshed from the ledger.' : 'Draft saved.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title={r.title}
        back={{ to: '/admin/finance/reports', label: 'Reports' }}
        meta={
          <>
            <ReportStatusBadge status={r.status} />
            <span>{formatDate(r.period_start)} – {formatDate(r.period_end)}</span>
            <span>· prepared by {r.preparer?.full_name ?? 'team member'}</span>
            {r.approver && <span>· approved by {r.approver.full_name}</span>}
          </>
        }
        actions={
          <>
            {isDraft && <Button onClick={() => setDialog('publish')} disabled={approvalBlocked} iconLeft={<Send aria-hidden="true" className="size-4" />}>Approve and publish</Button>}
            {isDraft && <Button variant="ghost" onClick={() => setDialog('delete')} iconLeft={<Trash2 aria-hidden="true" className="size-4" />}>Delete draft</Button>}
            {r.status === 'published' && (
              <a href={`/transparency/${r.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-forest-700 hover:underline">
                View public page <ExternalLink aria-hidden="true" className="size-4" />
              </a>
            )}
            {r.status === 'published' && auth.hasRole('admin') && <Button variant="danger" size="sm" onClick={() => setDialog('withdraw')}>Withdraw</Button>}
          </>
        }
      />
      {isDraft && approvalBlocked && <Alert tone="info" className="mb-6">You prepared this report, so another treasurer or administrator must approve it.</Alert>}
      {r.status === 'withdrawn' && <Alert tone="danger" className="mb-6" title="Withdrawn">{r.withdrawal_reason} ({formatDateTime(r.withdrawn_at)})</Alert>}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card title="Text">
            {isDraft ? (
              <div className="flex flex-col gap-4">
                <Field id="rpt-title" label="Title" required>
                  <Input value={values.title} maxLength={160} onChange={(e) => setDraft({ ...values, title: e.target.value })} />
                </Field>
                <MarkdownField id="rpt-narrative" label="Narrative (optional)" value={values.narrative} onChange={(v) => setDraft({ ...values, narrative: v })} max={20000} hint="Explain the figures. Never name donors or the people PRAYASH helped." />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => save(false)} disabled={!draft}>Save draft</Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-line text-ink-700">{r.narrative || 'No narrative.'}</p>
            )}
          </Card>
          <Card title={<span className="flex items-center gap-2"><FileText aria-hidden="true" className="size-4" /> Supporting documents</span>}>
            {docs.length ? (
              <ul className="mb-5 flex flex-col divide-y divide-ink-100">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                    <button
                      type="button"
                      className="text-left font-medium text-forest-700 hover:underline"
                      onClick={async () => {
                        try {
                          window.open(await reportDocumentStaffUrl(d.storage_path), '_blank', 'noopener');
                        } catch (err) {
                          toast.error(errorMessage(err));
                        }
                      }}
                    >
                      {d.title}
                    </button>
                    {isDraft && (
                      <Button size="sm" variant="ghost" aria-label={`Remove ${d.title}`} onClick={async () => { try { await removeReportDocument(d); refresh(); } catch (err) { toast.error(errorMessage(err)); } }}>
                        <Trash2 aria-hidden="true" className="size-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-5 text-sm text-ink-600">No documents attached.</p>
            )}
            {isDraft && (
              <div className="flex flex-col gap-3 rounded-md bg-ivory-50 p-4">
                <Field id="doc-title" label="Document title" hint="e.g. Bank statement extract (redacted)">
                  <Input value={docTitle} maxLength={160} onChange={(e) => setDocTitle(e.target.value)} />
                </Field>
                <Checkbox
                  label="I confirm all personal data has been removed (names, phone numbers, account numbers, addresses)."
                  checked={redacted}
                  onChange={(e) => setRedacted(e.target.checked)}
                />
                <label className={`inline-flex h-11 items-center gap-2 self-start rounded-full px-5 text-sm font-medium ${redacted && docTitle.trim().length >= 2 ? 'cursor-pointer bg-forest-700 text-ivory-50 hover:bg-forest-800' : 'cursor-not-allowed bg-ink-100 text-ink-500'}`}>
                  <Upload aria-hidden="true" className="size-4" /> {uploading ? 'Uploading…' : 'Upload PDF'}
                  <input
                    type="file"
                    accept="application/pdf"
                    className="sr-only"
                    disabled={!redacted || docTitle.trim().length < 2 || uploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file || !auth.userId) return;
                      setUploading(true);
                      try {
                        await uploadReportDocument(r.id, file, docTitle.trim(), auth.userId);
                        setDocTitle('');
                        setRedacted(false);
                        refresh();
                        toast.success('Document attached.');
                      } catch (err) {
                        toast.error(errorMessage(err));
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </label>
              </div>
            )}
          </Card>
        </div>
        <Card
          title="Figures"
          actions={isDraft && <Button size="sm" variant="secondary" iconLeft={<RefreshCw aria-hidden="true" className="size-4" />} onClick={() => save(true)}>Refresh from ledger</Button>}
        >
          <Snapshot s={r.summary as unknown as ReportSnapshot} />
          <p className="mt-3 text-xs text-ink-600">
            Frozen {formatDateTime(r.snapshot_generated_at)}. Figures are recalculated once more at approval, then never change.
          </p>
        </Card>
      </div>
      <ConfirmDialog
        open={dialog === 'publish'}
        onClose={() => setDialog(null)}
        title="Approve and publish this report?"
        description="The figures are recalculated from verified entries and frozen. The report becomes visible to everyone on the Transparency page and cannot be edited afterwards."
        confirmLabel="Approve and publish"
        onConfirm={async () => {
          await publishReport(r.id);
          refresh();
          toast.success('Report published.');
        }}
      />
      <ConfirmDialog
        open={dialog === 'withdraw'}
        onClose={() => setDialog(null)}
        tone="danger"
        title="Withdraw this report?"
        description="It will no longer be shown publicly. The record and its reason are kept."
        confirmLabel="Withdraw report"
        reason={{ label: 'Reason', required: true, minLength: 5 }}
        onConfirm={async (reason) => {
          await withdrawReport(r.id, reason);
          refresh();
          toast.success('Report withdrawn.');
        }}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        tone="danger"
        title="Delete this draft?"
        description="Remove any attached documents first."
        confirmLabel="Delete draft"
        onConfirm={async () => {
          await deleteReportDraft(r.id);
          refresh();
          navigate('/admin/finance/reports', { replace: true });
        }}
      />
    </>
  );
}

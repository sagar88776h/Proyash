import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, EyeOff, MessageSquareText, Paperclip, Phone, ShieldX } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Alert, Badge, EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { LoadingBlock } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/useAuth';
import { callFunction } from '@/lib/api/functions';
import { telLink, whatsappLink } from '@/lib/contact';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  ASSISTANCE_CATEGORY_LABELS,
  ASSISTANCE_STATUS_LABELS,
  CONTACT_METHOD_LABELS,
  RELATIONSHIP_LABELS,
  URGENCY_LABELS,
} from '@/lib/labels';
import type { Enums } from '@/types/database';
import {
  addNote,
  ALLOWED_TRANSITIONS,
  assignReviewer,
  changeStatus,
  followupAttachmentUrl,
  getRequest,
  listReviewers,
  markFollowupsRead,
  setApplicantMessage,
} from '../api/requests';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Card, KeyValue, PageHeader } from '../components/PageHeader';
import { AssistanceStatusBadge } from '../components/StatusBadges';
import { useToast } from '../components/useToast';

function StatusDialog({
  open,
  onClose,
  current,
  currentMessage,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  current: Enums<'assistance_status'>;
  currentMessage: string | null;
  onSubmit: (status: Enums<'assistance_status'>, reason: string, message: string) => Promise<void>;
}) {
  const options = ALLOWED_TRANSITIONS[current];
  const [status, setStatus] = useState<Enums<'assistance_status'> | ''>('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState(currentMessage ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const needsReason = status === 'declined' || status === 'more_information_required';
  const needsMessage = status === 'more_information_required';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change status"
      description={`Currently: ${ASSISTANCE_STATUS_LABELS[current]}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!status || (needsReason && reason.trim().length < 3) || (needsMessage && message.trim().length < 3)}
            onClick={async () => {
              if (!status) return;
              setBusy(true);
              setError(undefined);
              try {
                await onSubmit(status, reason.trim(), message.trim());
                setStatus('');
                setReason('');
                onClose();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save status
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field id="new-status" label="New status" required>
          <Select value={status} onChange={(e) => setStatus(e.target.value as Enums<'assistance_status'>)}>
            <option value="">Choose…</option>
            {options.map((s) => (
              <option key={s} value={s}>{ASSISTANCE_STATUS_LABELS[s]}</option>
            ))}
          </Select>
        </Field>
        <Field id="status-reason" label="Internal note" required={needsReason} hint="Visible to reviewers only. Required when declining or asking for more information.">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
        </Field>
        {(needsMessage || status === 'approved' || status === 'declined' || status === 'assistance_provided') && (
          <Field
            id="applicant-message"
            label="Message shown to the applicant"
            required={needsMessage}
            hint="Shown when they check their status with the reference and phone number. Do not include other people’s details."
          >
            <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={600} />
          </Field>
        )}
        {error && <Alert tone="danger" live="assertive">{error}</Alert>}
      </div>
    </Dialog>
  );
}

export function RequestDetailPage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'request', id], queryFn: () => getRequest(id) });
  const reviewers = useQuery({ queryKey: ['admin', 'reviewers'], queryFn: listReviewers });
  const [statusOpen, setStatusOpen] = useState(false);
  const [redactOpen, setRedactOpen] = useState(false);
  const [note, setNote] = useState('');
  const [messageDraft, setMessageDraft] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'request', id] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'requests'] });
  };
  const noteMutation = useMutation({
    mutationFn: () => addNote(id, note.trim()),
    onSuccess: () => {
      setNote('');
      refresh();
      toast.success('Note added.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const readMutation = useMutation({ mutationFn: () => markFollowupsRead(id), onSuccess: refresh });

  if (query.isLoading) return <LoadingBlock label="Loading request" />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const data = query.data;
  if (!data?.request) return <EmptyState title="Request not found" description="It may not exist, or you may not have access." />;
  const r = data.request;
  const redacted = Boolean(r.redacted_at);
  const closed = r.status === 'declined' || r.status === 'assistance_provided';
  const wa = whatsappLink(r.phone);

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{r.reference_code}</span>}
        documentTitle={`Request ${r.reference_code}`}
        back={{ to: '/admin/requests', label: 'All requests' }}
        meta={
          <>
            <AssistanceStatusBadge status={r.status} />
            {r.urgency === 'urgent' && <Badge tone="danger">Urgent</Badge>}
            <span>{ASSISTANCE_CATEGORY_LABELS[r.category]}</span>
            <span>· Received {formatDateTime(r.created_at)}</span>
            {r.source === 'staff_entry' && <span>· Recorded by {r.recorder?.full_name || 'staff'}</span>}
          </>
        }
        actions={
          !redacted && (
            <>
              {ALLOWED_TRANSITIONS[r.status].length > 0 && <Button onClick={() => setStatusOpen(true)}>Change status</Button>}
              {auth.hasRole('admin') && closed && (
                <Button variant="secondary" iconLeft={<EyeOff aria-hidden="true" className="size-4" />} onClick={() => setRedactOpen(true)}>
                  Redact personal data
                </Button>
              )}
            </>
          )
        }
      />
      {redacted && (
        <Alert tone="info" title="Personal data removed" className="mb-6">
          Personal details were redacted on {formatDate(r.redacted_at)}. Only anonymous information remains.
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card title="Applicant">
            <KeyValue
              items={[
                { label: 'Name', value: r.applicant_name ?? '—' },
                { label: 'Request made for', value: RELATIONSHIP_LABELS[r.requester_relationship] },
                {
                  label: 'Phone',
                  value: r.phone ? (
                    <span className="flex flex-wrap items-center gap-3">
                      <a href={telLink(r.phone) ?? undefined} className="inline-flex items-center gap-1 text-forest-700 hover:underline">
                        <Phone aria-hidden="true" className="size-4" /> {r.phone}
                      </a>
                      {wa && (
                        <a href={wa} target="_blank" rel="noopener noreferrer" className="text-sm text-forest-700 hover:underline">
                          WhatsApp
                        </a>
                      )}
                    </span>
                  ) : '—',
                },
                { label: 'Email', value: r.email ?? '—' },
                { label: 'Preferred contact', value: CONTACT_METHOD_LABELS[r.preferred_contact] },
                { label: 'Urgency', value: URGENCY_LABELS[r.urgency] },
                { label: 'Village', value: r.village?.name ?? '—' },
                { label: 'Locality', value: r.locality ?? '—' },
              ]}
            />
          </Card>
          <Card title="Situation described">
            <p className="whitespace-pre-line text-ink-800">{r.description}</p>
          </Card>
          <Card
            title={
              <span className="flex items-center gap-2">
                Information from the applicant
                {r.has_unread_followup && <Badge tone="gold">New</Badge>}
              </span>
            }
            actions={r.has_unread_followup ? <Button size="sm" variant="secondary" loading={readMutation.isPending} onClick={() => readMutation.mutate()}>Mark as read</Button> : undefined}
          >
            {data.followups.length ? (
              <ul className="flex flex-col gap-4">
                {data.followups.map((f) => (
                  <li key={f.id} className="rounded-md bg-ivory-50 p-4">
                    <p className="mb-1 text-xs text-ink-600">
                      {formatDateTime(f.created_at)} {f.read_at ? '· read' : '· unread'}
                    </p>
                    <p className="whitespace-pre-line">{f.message}</p>
                    {f.attachment_path && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2"
                        iconLeft={<Download aria-hidden="true" className="size-4" />}
                        onClick={async () => {
                          try {
                            window.open(await followupAttachmentUrl(f.attachment_path!), '_blank', 'noopener');
                          } catch (err) {
                            toast.error(errorMessage(err));
                          }
                        }}
                      >
                        <Paperclip aria-hidden="true" className="size-3.5" /> {f.attachment_name}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">Nothing yet. When the status is “More information required”, the applicant can send information from the status page.</p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Assignment">
            <Field id="assign-reviewer" label="Reviewer responsible">
              <Select
                disabled={redacted}
                value={r.assigned_reviewer_id ?? ''}
                onChange={async (e) => {
                  try {
                    await assignReviewer(id, e.target.value || null);
                    refresh();
                    toast.success('Reviewer updated.');
                  } catch (err) {
                    toast.error(errorMessage(err));
                  }
                }}
              >
                <option value="">Unassigned</option>
                {(reviewers.data ?? []).map((rv) => (
                  <option key={rv.id} value={rv.id}>{rv.name}{rv.id === auth.userId ? ' (you)' : ''}</option>
                ))}
              </Select>
            </Field>
          </Card>
          <Card title="Message to applicant">
            <p className="mb-3 text-sm text-ink-600">Shown on the public status page after they enter their reference and phone number.</p>
            <Textarea
              rows={3}
              maxLength={600}
              disabled={redacted}
              aria-label="Message to applicant"
              value={messageDraft ?? r.applicant_message ?? ''}
              onChange={(e) => setMessageDraft(e.target.value)}
            />
            {messageDraft !== null && messageDraft !== (r.applicant_message ?? '') && (
              <Button
                size="sm"
                className="mt-3"
                onClick={async () => {
                  try {
                    await setApplicantMessage(id, messageDraft);
                    setMessageDraft(null);
                    refresh();
                    toast.success('Message saved.');
                  } catch (err) {
                    toast.error(errorMessage(err));
                  }
                }}
              >
                Save message
              </Button>
            )}
          </Card>
          <Card title={<span className="flex items-center gap-2"><MessageSquareText aria-hidden="true" className="size-4" /> Internal notes</span>}>
            <ul className="mb-4 flex flex-col gap-3">
              {data.notes.map((n) => (
                <li key={n.id} className="rounded-md bg-ivory-50 p-3">
                  <p className="text-xs text-ink-600">{n.author?.full_name || 'Team member'} · {formatDateTime(n.created_at)}</p>
                  <p className="mt-1 whitespace-pre-line text-sm">{n.body}</p>
                </li>
              ))}
              {!data.notes.length && <li className="text-sm text-ink-600">No notes yet.</li>}
            </ul>
            {!redacted && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (note.trim()) noteMutation.mutate();
                }}
                className="flex flex-col gap-2"
              >
                <Field id="new-note" label="Add a note" hideLabel>
                  <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Calls, visits, decisions… (reviewers only)" maxLength={4000} />
                </Field>
                <div>
                  <Button type="submit" size="sm" loading={noteMutation.isPending} disabled={!note.trim()}>Add note</Button>
                </div>
              </form>
            )}
          </Card>
          <Card title="Status history">
            <ol className="flex flex-col gap-3 text-sm">
              {data.history.map((h) => (
                <li key={h.id} className="border-l-2 border-forest-200 pl-3">
                  <p className="font-medium">{ASSISTANCE_STATUS_LABELS[h.to_status]}</p>
                  <p className="text-xs text-ink-600">{formatDateTime(h.created_at)} · {h.actor?.full_name || (h.from_status ? 'Applicant' : 'Website')}</p>
                  {h.reason && <p className="mt-1 text-ink-700">{h.reason}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <StatusDialog
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        current={r.status}
        currentMessage={r.applicant_message}
        onSubmit={async (status, reason, message) => {
          await changeStatus(id, status, reason, message);
          refresh();
          toast.success(`Status changed to ${ASSISTANCE_STATUS_LABELS[status]}.`);
        }}
      />
      <ConfirmDialog
        open={redactOpen}
        onClose={() => setRedactOpen(false)}
        tone="danger"
        title="Redact personal data?"
        description="Removes the applicant’s name, contact details, description, notes and attachments permanently. Anonymous information (type, status, dates) is kept for statistics."
        confirmLabel="Redact permanently"
        onConfirm={async () => {
          await callFunction('staff-api', '/assistance/redact', { body: { request_id: id }, auth: true });
          refresh();
          toast.success('Personal data removed.');
        }}
      >
        <p className="flex items-center gap-2 text-sm text-danger-700">
          <ShieldX aria-hidden="true" className="size-4" /> This cannot be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}

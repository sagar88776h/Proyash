import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { LoadingBlock } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/useAuth';
import { telLink } from '@/lib/contact';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { ACTIVITY_CATEGORY_LABELS, ASSIGNMENT_STATUS_LABELS, AVAILABILITY_LABELS, SKILL_LABELS, VOLUNTEER_STATUS_LABELS } from '@/lib/labels';
import type { Enums } from '@/types/database';
import {
  assignVolunteer,
  getVolunteer,
  linkVolunteerAccount,
  listAssignableProjects,
  listVolunteerAccounts,
  removeAssignment,
  updateAssignment,
  updateVolunteer,
} from '../api/volunteers';
import { Card, KeyValue, PageHeader } from '../components/PageHeader';
import { AssignmentStatusBadge, VolunteerStatusBadge } from '../components/StatusBadges';
import { useToast } from '../components/useToast';

export function VolunteerDetailPage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'volunteer', id], queryFn: () => getVolunteer(id) });
  const projects = useQuery({ queryKey: ['admin', 'assignable-projects'], queryFn: listAssignableProjects });
  const accounts = useQuery({ queryKey: ['admin', 'volunteer-accounts'], queryFn: listVolunteerAccounts, enabled: auth.hasRole('admin') });
  const [notes, setNotes] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [role, setRole] = useState('');
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'volunteer', id] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'volunteers'] });
  };
  const run = async (fn: () => Promise<void>, success: string) => {
    try {
      await fn();
      refresh();
      toast.success(success);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (query.isLoading) return <LoadingBlock label="Loading volunteer" />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const v = query.data?.volunteer;
  if (!v) return <EmptyState title="Volunteer not found" />;
  const assignments = query.data!.assignments;
  const canAssign = v.status === 'approved' || v.status === 'active';

  return (
    <>
      <PageHeader
        title={v.full_name}
        back={{ to: '/admin/volunteers', label: 'All volunteers' }}
        meta={
          <>
            <VolunteerStatusBadge status={v.status} />
            <span>Registered {formatDate(v.created_at)}</span>
            {v.reviewed_at && <span>· Reviewed by {v.reviewer?.full_name || 'team'} on {formatDate(v.reviewed_at)}</span>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card title="Details">
            <KeyValue
              items={[
                { label: 'Phone', value: <a href={telLink(v.phone) ?? undefined} className="inline-flex items-center gap-1 text-forest-700 hover:underline"><Phone aria-hidden="true" className="size-4" />{v.phone}</a> },
                { label: 'Email', value: v.email ?? '—' },
                { label: 'Village', value: v.village?.name ?? '—' },
                { label: 'Locality', value: v.locality ?? '—' },
                { label: 'Age', value: v.is_adult ? '18 or older' : <Badge tone="warning">Under 18</Badge> },
                { label: 'Parent / guardian', value: v.is_adult ? '—' : `${v.guardian_name ?? ''} · ${v.guardian_phone ?? ''}`, hidden: v.is_adult },
                { label: 'Languages', value: v.languages ?? '—' },
                { label: 'Public recognition', value: v.consent_public_recognition ? 'Agreed to be named publicly' : 'Not to be named publicly' },
                { label: 'Skills', value: [...v.skills.map((s) => SKILL_LABELS[s] ?? s), v.skills_other].filter(Boolean).join(', ') || '—' },
                { label: 'Availability', value: v.availability.map((a) => AVAILABILITY_LABELS[a] ?? a).join(', ') || '—' },
                { label: 'Interested in', value: v.preferred_activities.map((a) => ACTIVITY_CATEGORY_LABELS[a]).join(', ') || '—' },
              ]}
            />
            {v.motivation && (
              <div className="mt-5 rounded-md bg-ivory-50 p-4">
                <p className="text-sm text-ink-600">In their words</p>
                <p className="mt-1 whitespace-pre-line">{v.motivation}</p>
              </div>
            )}
          </Card>
          <Card title="Project assignments">
            {assignments.length ? (
              <ul className="mb-5 flex flex-col divide-y divide-ink-100">
                {assignments.map((a) => (
                  <li key={a.project_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{a.project?.title}</p>
                      <p className="text-sm text-ink-600">{a.role_description || 'No role description'} · assigned {formatDate(a.assigned_at)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <AssignmentStatusBadge status={a.status} />
                      <Select
                        aria-label={`Update status for ${a.project?.title}`}
                        className="h-9 w-40 text-sm"
                        value={a.status}
                        onChange={(e) => run(() => updateAssignment(a.project_id, v.id, { status: e.target.value as Enums<'assignment_status'> }), 'Assignment updated.')}
                      >
                        {Object.entries(ASSIGNMENT_STATUS_LABELS).map(([val, l]) => <option key={val} value={val}>{l}</option>)}
                      </Select>
                      <Button size="sm" variant="ghost" aria-label={`Remove from ${a.project?.title}`} onClick={() => run(() => removeAssignment(a.project_id, v.id), 'Assignment removed.')}>
                        <Trash2 aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-5 text-sm text-ink-600">Not assigned to any project yet.</p>
            )}
            {canAssign ? (
              <form
                className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!projectId) return;
                  void run(async () => {
                    await assignVolunteer(projectId, v.id, role);
                    setProjectId('');
                    setRole('');
                  }, 'Volunteer assigned.');
                }}
              >
                <Field id="assign-project" label="Assign to project">
                  <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    <option value="">Choose a project…</option>
                    {(projects.data ?? []).filter((p) => !assignments.some((a) => a.project_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </Select>
                </Field>
                <Field id="assign-role" label="Role" optionalLabel>
                  <Input value={role} onChange={(e) => setRole(e.target.value)} maxLength={200} placeholder="e.g. Distribution helper" />
                </Field>
                <Button type="submit" disabled={!projectId}>Assign</Button>
              </form>
            ) : (
              <p className="text-sm text-ink-600">Approve the volunteer before assigning them to projects.</p>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card title="Status">
            <Field id="vol-status-select" label="Volunteer status">
              <Select value={v.status} onChange={(e) => run(() => updateVolunteer(v.id, { status: e.target.value as Enums<'volunteer_status'> }), 'Status updated.')}>
                {Object.entries(VOLUNTEER_STATUS_LABELS).map(([val, l]) => <option key={val} value={val}>{l}</option>)}
              </Select>
            </Field>
          </Card>
          <Card title="Coordinator notes">
            <Textarea rows={5} maxLength={4000} aria-label="Coordinator notes" value={notes ?? v.coordinator_notes ?? ''} onChange={(e) => setNotes(e.target.value)} />
            {notes !== null && notes !== (v.coordinator_notes ?? '') && (
              <Button size="sm" className="mt-3" onClick={() => run(async () => { await updateVolunteer(v.id, { coordinator_notes: notes || null }); setNotes(null); }, 'Notes saved.')}>
                Save notes
              </Button>
            )}
            <p className="mt-2 text-xs text-ink-600">Visible to coordinators and administrators only.</p>
          </Card>
          {auth.hasRole('admin') && (
            <Card title="Portal account">
              <p className="mb-3 text-sm text-ink-600">Link a user with the Volunteer role so this person can see their own assignments.</p>
              <Select
                aria-label="Linked account"
                value={v.profile_id ?? ''}
                onChange={(e) => run(() => linkVolunteerAccount(v.id, e.target.value || null), 'Account link updated.')}
              >
                <option value="">Not linked</option>
                {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </Select>
              {v.account && <p className="mt-2 text-xs text-ink-600">Linked to {v.account.full_name || v.account.email} · last updated {formatDateTime(v.updated_at)}</p>}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

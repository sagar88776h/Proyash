import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, MapPin } from 'lucide-react';
import { useState } from 'react';
import { QueryState } from '@/components/QueryState';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { Checkbox, ChoiceGroup, Field, Input } from '@/components/ui/Field';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { ACTIVITY_CATEGORY_LABELS, AVAILABILITY_LABELS, optionsFrom, SKILL_LABELS } from '@/lib/labels';
import type { Enums, Tables } from '@/types/database';
import { getMyVolunteerProfile, respondToAssignment, updateMyVolunteerProfile } from '../api/volunteers';
import { Card, PageHeader } from '../components/PageHeader';
import { AssignmentStatusBadge } from '../components/StatusBadges';
import { useToast } from '../components/useToast';

function ProfileForm({ volunteer, onSaved }: { volunteer: Tables<'volunteers'>; onSaved: () => void }) {
  const toast = useToast();
  const [availability, setAvailability] = useState<string[]>(volunteer.availability);
  const [skills, setSkills] = useState<string[]>(volunteer.skills);
  const [activities, setActivities] = useState<string[]>(volunteer.preferred_activities);
  const [languages, setLanguages] = useState(volunteer.languages ?? '');
  const [recognition, setRecognition] = useState(volunteer.consent_public_recognition);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await updateMyVolunteerProfile({
            availability,
            skills,
            skills_other: volunteer.skills_other,
            preferred_activities: activities as Enums<'activity_category'>[],
            languages: languages || null,
            consent_public_recognition: recognition,
          });
          toast.success('Your details have been updated.');
          onSaved();
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <ChoiceGroup legend="When are you available?" type="checkbox" name="my-availability" columns={3} options={optionsFrom(AVAILABILITY_LABELS)} value={availability} onChange={(v) => setAvailability(v as string[])} />
      <ChoiceGroup legend="Skills" type="checkbox" name="my-skills" columns={3} options={optionsFrom(SKILL_LABELS)} value={skills} onChange={(v) => setSkills(v as string[])} />
      <ChoiceGroup legend="Activities you are interested in" type="checkbox" name="my-activities" columns={3} options={optionsFrom(ACTIVITY_CATEGORY_LABELS)} value={activities} onChange={(v) => setActivities(v as string[])} />
      <Field id="my-languages" label="Languages">
        <Input value={languages} onChange={(e) => setLanguages(e.target.value)} maxLength={200} />
      </Field>
      <Checkbox label="PRAYASH may mention my name publicly as a volunteer" checked={recognition} onChange={(e) => setRecognition(e.target.checked)} />
      <div>
        <Button type="submit" loading={busy} disabled={availability.length === 0}>Save my details</Button>
      </div>
    </form>
  );
}

export function MyAssignmentsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'my-volunteer'], queryFn: getMyVolunteerProfile });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'my-volunteer'] });
  return (
    <>
      <PageHeader title="My assignments" description="Projects a coordinator has assigned you to." />
      <QueryState
        query={query}
        isEmpty={(d) => !d.volunteer}
        empty={<EmptyState title="Your account is not linked to a volunteer record yet" description="Ask a PRAYASH administrator to link your volunteer registration to this account." />}
      >
        {(d) => (
          <div className="flex flex-col gap-6">
            {d.assignments.length ? (
              <ul className="grid gap-4 md:grid-cols-2">
                {d.assignments.map((a) => (
                  <li key={a.project_id}>
                    <Card>
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h2 className="font-display text-lg font-semibold">{a.project?.title}</h2>
                          <AssignmentStatusBadge status={a.status} />
                        </div>
                        <p className="text-sm text-ink-700">{a.project?.summary}</p>
                        <p className="text-sm text-ink-600">Your role: {a.role_description || 'to be confirmed by your coordinator'}</p>
                        <div className="flex flex-wrap gap-4 text-sm text-ink-600">
                          {(a.project?.village?.name || a.project?.locality) && (
                            <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="size-4" />{a.project?.village?.name ?? a.project?.locality}</span>
                          )}
                          {a.project?.start_date && (
                            <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden="true" className="size-4" />{formatDate(a.project.start_date)}</span>
                          )}
                        </div>
                        {(a.status === 'assigned' || a.status === 'confirmed') && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {a.status === 'assigned' && (
                              <Button size="sm" onClick={async () => { try { await respondToAssignment(a.project_id, 'confirmed'); refresh(); toast.success('Thank you for confirming.'); } catch (err) { toast.error(errorMessage(err)); } }}>
                                Confirm I can help
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={async () => { try { await respondToAssignment(a.project_id, 'withdrawn'); refresh(); toast.success('Your coordinator has been notified.'); } catch (err) { toast.error(errorMessage(err)); } }}>
                              I can no longer help
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No assignments yet" description="When a coordinator assigns you to a project, it will appear here." />
            )}
            <Card title="My volunteer details">
              <ProfileForm volunteer={d.volunteer!} onSaved={refresh} />
            </Card>
          </div>
        )}
      </QueryState>
    </>
  );
}

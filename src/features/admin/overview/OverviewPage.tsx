import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { QueryState } from '@/components/QueryState';
import { ButtonLink } from '@/components/ui/Button';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { useAuth } from '@/features/auth/useAuth';
import { formatDateTime, formatNumber } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/labels';
import { getMyVolunteerProfile } from '../api/volunteers';
import { AUDIT_ENTITIES, launchReadiness, overviewCounts, recentActivity, teamNames } from '../api/admin';
import { Card, PageHeader } from '../components/PageHeader';

function Tile({ to, label, value, hint }: { to: string; label: string; value: number | null | undefined; hint?: string }) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-1 rounded-card bg-white p-5 shadow-[inset_0_0_0_1px_rgb(34_41_35/0.08)] transition-shadow hover:shadow-[inset_0_0_0_1px_rgb(23_75_53/0.35)]"
    >
      <span className="text-sm text-ink-600">{label}</span>
      <span className="font-display text-3xl font-semibold text-forest-800 tabular-nums">
        {value === null || value === undefined ? '—' : formatNumber(value)}
      </span>
      {hint && <span className="text-xs text-ink-600">{hint}</span>}
    </Link>
  );
}

function CheckItem({ done, children, to, action }: { done: boolean; children: ReactNode; to: string; action: string }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {done ? (
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-forest-600" />
      ) : (
        <Circle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-450" />
      )}
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
        <span>
          <span className="sr-only">{done ? 'Done: ' : 'To do: '}</span>
          {children}
        </span>
        {!done && (
          <Link to={to} className="text-sm font-medium text-forest-700 underline underline-offset-2">
            {action}
          </Link>
        )}
      </div>
    </li>
  );
}

function LaunchChecklist() {
  const query = useQuery({ queryKey: ['admin', 'overview', 'readiness'], queryFn: launchReadiness });
  return (
    <Card title="Launch checklist">
      <p className="mb-2 text-sm text-ink-600">
        Calculated from the live data. Items stay open until they are done in the portal. Placeholders on the website disappear as each item is completed.
      </p>
      <QueryState query={query}>
        {(r) => (
          <ul className="divide-y divide-ink-100">
            <CheckItem done={r.contact} to="/admin/settings" action="Add contact details">Official phone number or email address published</CheckItem>
            <CheckItem done={r.donation} to="/admin/settings" action="Set up donations">Authorised payment details entered and donations switched on</CheckItem>
            <CheckItem done={r.accounts} to="/admin/finance/accounts" action="Add an account">At least one financial account set up in the ledger</CheckItem>
            <CheckItem done={r.financeTeam} to="/admin/users" action="Invite a treasurer">Two people can handle finance, so entries can be independently verified</CheckItem>
            <CheckItem done={r.story} to="/admin/content/about" action="Write the story">“Our story” written and published on the About page</CheckItem>
            <CheckItem done={r.privacy} to="/admin/content/privacy" action="Review the policy">Privacy policy reviewed and published</CheckItem>
            <CheckItem done={r.terms} to="/admin/content/terms" action="Review the terms">Terms of use reviewed and published</CheckItem>
            <CheckItem done={r.photos} to="/admin/media" action="Upload photos">Authentic PRAYASH photographs published</CheckItem>
          </ul>
        )}
      </QueryState>
    </Card>
  );
}

function describeAction(action: string) {
  const map: Record<string, string> = { insert: 'created', update: 'updated', delete: 'deleted' };
  return map[action] ?? action.replace(/_/g, ' ');
}

function RecentActivity() {
  const query = useQuery({
    queryKey: ['admin', 'overview', 'activity'],
    queryFn: async () => {
      const [rows, names] = await Promise.all([recentActivity(8), teamNames()]);
      return { rows, names };
    },
  });
  return (
    <Card title="Recent activity" actions={<Link to="/admin/audit" className="text-sm font-medium text-forest-700 underline underline-offset-2">Full history</Link>}>
      <QueryState query={query} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState title="No activity yet" />}>
        {({ rows, names }) => (
          <ol className="divide-y divide-ink-100 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5">
                <span>
                  <span className="font-medium">{r.actor_id ? (names.get(r.actor_id) ?? 'Former team member') : 'Website / system'}</span>{' '}
                  {describeAction(r.action)} · {AUDIT_ENTITIES[r.entity_type] ?? r.entity_type}
                </span>
                <time dateTime={r.occurred_at} className="text-ink-600">{formatDateTime(r.occurred_at)}</time>
              </li>
            ))}
          </ol>
        )}
      </QueryState>
    </Card>
  );
}

function VolunteerSummary() {
  const query = useQuery({ queryKey: ['admin', 'my-volunteer'], queryFn: getMyVolunteerProfile });
  return (
    <Card title="Your volunteering">
      <QueryState query={query}>
        {({ volunteer, assignments }) => {
          if (!volunteer) {
            return <p className="text-ink-600">Your account is not yet linked to a volunteer registration. Ask a volunteer coordinator to link it.</p>;
          }
          const awaiting = assignments.filter((a) => a.status === 'assigned').length;
          const active = assignments.filter((a) => a.status === 'confirmed').length;
          return (
            <div className="flex flex-col gap-4">
              <p>
                {awaiting > 0
                  ? `${awaiting} assignment${awaiting === 1 ? '' : 's'} waiting for your response.`
                  : 'No assignments are waiting for your response.'}{' '}
                {active > 0 && `${active} confirmed.`}
              </p>
              <ButtonLink to="/admin/my-assignments" size="sm" variant="secondary" className="self-start">See my assignments</ButtonLink>
            </div>
          );
        }}
      </QueryState>
    </Card>
  );
}

export function OverviewPage() {
  const auth = useAuth();
  const has = auth.hasRole;
  const counts = useQuery({
    queryKey: ['admin', 'overview', 'counts', auth.roles.join(',')],
    queryFn: () => overviewCounts(auth.roles, auth.userId!),
    enabled: Boolean(auth.userId),
  });
  const c = counts.data ?? {};
  const staffTiles = has('admin', 'assistance_reviewer', 'volunteer_coordinator', 'publisher', 'treasurer');
  const firstName = auth.fullName.split(' ')[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome, ${firstName}` : 'Welcome'}
        documentTitle="Overview"
        description={auth.roles.length ? `Signed in as ${auth.roles.map((r) => ROLE_LABELS[r]).join(', ')}.` : undefined}
      />

      {auth.aal !== 'aal2' && has('admin', 'treasurer') && (
        <Alert tone="warning" title="Protect your account with two-step verification" className="mb-6" action={<ButtonLink to="/admin/account" size="sm" variant="secondary">Set it up</ButtonLink>}>
          Your role can see personal and financial information. Add an authenticator app so a stolen password alone is not enough to sign in.
        </Alert>
      )}

      {counts.isError && (
        <Alert tone="danger" className="mb-6">Some figures could not be loaded. Refresh the page to try again.</Alert>
      )}

      {staffTiles && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {has('admin', 'assistance_reviewer') && (
            <>
              <Tile to="/admin/requests?status=pending" label="New requests for help" value={c.newRequests} hint="Not yet reviewed" />
              <Tile to="/admin/requests?status=open" label="Open requests" value={c.openRequests} hint={c.myRequests ? `${c.myRequests} assigned to you` : undefined} />
              {Boolean(c.unreadFollowups) && <Tile to="/admin/requests?status=open" label="Unread follow-ups" value={c.unreadFollowups} hint="Applicants sent more information" />}
            </>
          )}
          {has('admin', 'volunteer_coordinator') && (
            <Tile to="/admin/volunteers?status=pending" label="Volunteer registrations to review" value={c.pendingVolunteers} />
          )}
          {has('admin', 'publisher', 'volunteer_coordinator') && (
            <>
              <Tile to="/admin/projects" label="Unpublished projects" value={c.draftProjects} />
              <Tile to="/admin/media" label="Photos awaiting review" value={c.photosToReview} />
            </>
          )}
          {has('admin', 'treasurer') && (
            <>
              <Tile to="/admin/finance" label="Ledger entries to verify" value={c.pendingEntries} hint="Pending entries do not count in balances" />
              <Tile to="/admin/finance/reports" label="Draft financial reports" value={c.draftReports} />
            </>
          )}
          {has('admin') && <Tile to="/admin/messages" label="New contact messages" value={c.newMessages} />}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {has('volunteer') && <VolunteerSummary />}
        {has('admin') && <LaunchChecklist />}
        {has('admin') && <RecentActivity />}
        {!has('admin') && (
          <Card title="Good practice">
            <ul className="flex list-disc flex-col gap-2 pl-5 text-ink-700">
              <li>Never share personal details from this portal by WhatsApp, screenshots or personal email.</li>
              <li>Sign out when you finish, especially on a shared phone or computer.</li>
              <li>Only publish photos or stories of identifiable people with their informed consent.</li>
              {has('treasurer') && <li>A payment screenshot is not proof of payment — always check the bank statement before verifying.</li>}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

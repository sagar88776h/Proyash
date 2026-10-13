import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { QueryState } from '@/components/QueryState';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { Checkbox, Field, Input } from '@/components/ui/Field';
import { useAuth } from '@/features/auth/useAuth';
import { errorMessage, toAppError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/labels';
import { inviteUser, listTeam, setUserActive, setUserRoles, type AppRole, type TeamMember } from '../api/admin';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataTable, type Column } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';

const ROLES = Object.keys(ROLE_LABELS) as AppRole[];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function RolePicker({ value, onChange, idPrefix, lockAdmin }: { value: AppRole[]; onChange: (r: AppRole[]) => void; idPrefix: string; lockAdmin?: boolean }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 font-medium">Roles</legend>
      <p className="-mt-1 text-sm text-ink-600">Give people only the roles they need. Every permission is also enforced by the database.</p>
      {ROLES.map((role) => (
        <Checkbox
          key={role}
          id={`${idPrefix}-${role}`}
          label={ROLE_LABELS[role]}
          description={lockAdmin && role === 'admin' ? 'You cannot remove your own administrator role.' : ROLE_DESCRIPTIONS[role]}
          checked={value.includes(role)}
          disabled={lockAdmin && role === 'admin'}
          onChange={(e) => onChange(e.target.checked ? [...value, role] : value.filter((r) => r !== role))}
        />
      ))}
    </fieldset>
  );
}

function InviteDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Invite a team member"
      description="They receive an email with a link to choose a password. The link expires after one hour — if it does, they can request a new one with “Forgot your password?” on the sign-in page."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            onClick={async () => {
              const next: Record<string, string> = {};
              if (!EMAIL.test(email.trim())) next.email = 'Enter a valid email address.';
              if (name.trim().length < 2) next.full_name = 'Enter their name.';
              if (roles.length === 0) next.roles = 'Choose at least one role.';
              setErrors(next);
              setError(undefined);
              if (Object.keys(next).length) return;
              setBusy(true);
              try {
                await inviteUser({ email: email.trim().toLowerCase(), full_name: name.trim(), roles });
                toast.success('Invitation sent.');
                onDone();
                onClose();
              } catch (err) {
                const e = toAppError(err);
                if (e.fields) setErrors(e.fields);
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Send invitation
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert tone="danger" live="assertive">{error}</Alert>}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="inv-name" label="Full name" required error={errors.full_name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" />
          </Field>
          <Field id="inv-email" label="Email address" required error={errors.email}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="off" />
          </Field>
        </div>
        <RolePicker idPrefix="inv-role" value={roles} onChange={setRoles} />
        {errors.roles && <p className="text-sm text-danger-700">{errors.roles}</p>}
        <p className="text-sm text-ink-600">
          To give a registered volunteer access to their assignments, invite them with the Volunteer role, then link the account from their volunteer record.
        </p>
      </div>
    </Dialog>
  );
}

function RolesDialog({ member, isSelf, onClose, onDone }: { member: TeamMember; isSelf: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [roles, setRoles] = useState<AppRole[]>(member.roles);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Roles for ${member.full_name || member.email}`}
      description="Removing every role keeps the account but removes all access."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                await setUserRoles(member.id, roles);
                toast.success('Roles updated. They take effect on the person’s next page load.');
                onDone();
                onClose();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save roles
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert tone="danger" live="assertive">{error}</Alert>}
        <RolePicker idPrefix={`roles-${member.id}`} value={roles} onChange={setRoles} lockAdmin={isSelf} />
      </div>
    </Dialog>
  );
}

export function UsersPage() {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'team'], queryFn: listTeam });
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [toggling, setToggling] = useState<TeamMember | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'team'] });

  const columns: Column<TeamMember>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (m) => (
        <span>
          {m.full_name || '—'}
          {m.id === auth.userId && <span className="text-ink-600"> (you)</span>}
          <span className="block text-sm font-normal text-ink-600">{m.email}</span>
        </span>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      cell: (m) =>
        m.roles.length ? (
          <span className="flex flex-wrap gap-1">
            {m.roles.map((r) => <Badge key={r} tone={r === 'admin' ? 'forest' : 'neutral'}>{ROLE_LABELS[r]}</Badge>)}
          </span>
        ) : (
          <span className="text-ink-600">No access</span>
        ),
    },
    {
      key: 'mfa',
      header: 'Two-step verification',
      cell: (m) => (m.has_mfa === null ? '—' : m.has_mfa ? <Badge tone="success">On</Badge> : <Badge tone="warning">Off</Badge>),
      hideOnMobile: true,
    },
    { key: 'status', header: 'Account', cell: (m) => (m.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>) },
    { key: 'since', header: 'Joined', cell: (m) => formatDate(m.created_at), hideOnMobile: true },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (m) => (
        <span className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing(m)} aria-label={`Change roles for ${m.full_name || m.email}`}>Roles</Button>
          {m.id !== auth.userId && (
            <Button size="sm" variant="ghost" onClick={() => setToggling(m)}>
              {m.is_active ? 'Deactivate' : 'Reactivate'}
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Everyone who can sign in to the portal. Accounts are never deleted — deactivate them so the history of what they did stays intact."
        actions={<Button size="sm" iconLeft={<UserPlus aria-hidden="true" className="size-4" />} onClick={() => setInviting(true)}>Invite</Button>}
      />
      <QueryState query={query} isEmpty={(rows) => rows.length === 0} empty={<EmptyState title="No team members" />}>
        {(rows) => <DataTable rows={rows} columns={columns} rowKey={(m) => m.id} caption="Team members" rowClassName={(m) => (m.is_active ? undefined : 'opacity-70')} />}
      </QueryState>

      {inviting && <InviteDialog onClose={() => setInviting(false)} onDone={refresh} />}
      {editing && <RolesDialog key={editing.id} member={editing} isSelf={editing.id === auth.userId} onClose={() => setEditing(null)} onDone={refresh} />}
      <ConfirmDialog
        open={toggling !== null}
        onClose={() => setToggling(null)}
        title={toggling?.is_active ? `Deactivate ${toggling.full_name || toggling.email}?` : `Reactivate ${toggling?.full_name || toggling?.email}?`}
        description={
          toggling?.is_active
            ? 'They lose all access immediately and are signed out. Their records and history are kept.'
            : 'They can sign in again with their existing password and regain their current roles.'
        }
        confirmLabel={toggling?.is_active ? 'Deactivate' : 'Reactivate'}
        tone={toggling?.is_active ? 'danger' : 'primary'}
        onConfirm={async () => {
          if (!toggling) return;
          const res = await setUserActive(toggling.id, !toggling.is_active);
          refresh();
          if (toggling.is_active && !res.sessions_revoked) {
            toast.error('Access removed, but existing sign-in sessions could not be ended. They will expire within an hour.');
          } else {
            toast.success(toggling.is_active ? 'Account deactivated.' : 'Account reactivated.');
          }
        }}
      />
    </>
  );
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { QueryState } from '@/components/QueryState';
import { Button } from '@/components/ui/Button';
import { Alert, Badge } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { PasswordForm } from '@/features/auth/SetPasswordPage';
import { authErrorMessage } from '@/features/auth/passwordPolicy';
import { useAuth } from '@/features/auth/useAuth';
import { AppError, errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/labels';
import { updateMyName } from '../api/admin';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { db } from '../components/db';
import { Card, KeyValue, PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';

function NameForm() {
  const auth = useAuth();
  const toast = useToast();
  const [name, setName] = useState(auth.fullName);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-4 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        if (name.trim().length < 2) return setError('Enter your name.');
        setError(undefined);
        setBusy(true);
        try {
          await updateMyName(auth.userId!, name.trim());
          await auth.refresh();
          toast.success('Name updated.');
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field id="acct-name" label="Your name" error={error} className="flex-1">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
      </Field>
      <Button type="submit" variant="secondary" loading={busy}>Save name</Button>
    </form>
  );
}

type Enrolment = { factorId: string; qr: string; secret: string };

function TwoStep() {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const factors = useQuery({
    queryKey: ['auth', 'factors', auth.userId],
    queryFn: async () => {
      const { data, error } = await db().auth.mfa.listFactors();
      if (error) throw error;
      return data.totp.filter((f) => f.status === 'verified');
    },
  });
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const sensitive = auth.hasRole('admin', 'treasurer', 'assistance_reviewer', 'volunteer_coordinator');

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['auth', 'factors'] });
    await auth.refresh();
  };

  const start = async () => {
    setError(undefined);
    setBusy(true);
    try {
      const client = db();
      // Clear abandoned set-up attempts so a fresh one can start.
      const existing = await client.auth.mfa.listFactors();
      for (const f of existing.data?.all ?? []) {
        if (f.factor_type === 'totp' && f.status === 'unverified') await client.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: enrollError } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
      if (enrollError) throw enrollError;
      setEnrolment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (err) {
      setError(authErrorMessage(err as { message?: string; code?: string; status?: number }));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!enrolment) return;
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from your authenticator app.');
    setError(undefined);
    setBusy(true);
    const { error: verifyError } = await db().auth.mfa.challengeAndVerify({ factorId: enrolment.factorId, code: code.trim() });
    setBusy(false);
    if (verifyError) return setError('That code did not work. Check the time on your phone is correct and try the newest code.');
    setEnrolment(null);
    setCode('');
    await refresh();
    toast.success('Two-step verification is on. You will be asked for a code each time you sign in.');
  };

  return (
    <Card title="Two-step verification">
      <QueryState query={factors}>
        {(verified) =>
          verified.length > 0 ? (
            <div className="flex flex-col gap-4">
              <p className="flex items-center gap-2">
                <ShieldCheck aria-hidden="true" className="size-5 text-forest-600" /> <Badge tone="success">On</Badge> You are asked for a code from your authenticator app when you sign in.
              </p>
              <ul className="flex flex-col gap-2 text-sm">
                {verified.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-ivory-50 px-3 py-2">
                    <span>{f.friendly_name ?? 'Authenticator app'} · added {formatDate(f.created_at)}</span>
                    <Button size="sm" variant="ghost" onClick={() => setRemoving(f.id)}>Remove</Button>
                  </li>
                ))}
              </ul>
              {auth.aal !== 'aal2' && <Alert tone="info">Sign out and sign in again with your code before changing two-step settings.</Alert>}
            </div>
          ) : enrolment ? (
            <div className="flex flex-col gap-5">
              <ol className="flex list-decimal flex-col gap-2 pl-5">
                <li>Open an authenticator app on your phone (for example Google Authenticator, Microsoft Authenticator or 2FAS).</li>
                <li>Scan this code, or enter the key below by hand.</li>
                <li>Enter the 6-digit code the app shows.</li>
              </ol>
              <div className="flex flex-col items-start gap-4 sm:flex-row">
                <img src={enrolment.qr} alt="QR code to add PRAYASH to your authenticator app" width={180} height={180} className="rounded-md bg-white p-2 shadow-[inset_0_0_0_1px_rgb(34_41_35/0.1)]" />
                <div className="min-w-0 text-sm">
                  <p className="text-ink-600">Key for manual entry</p>
                  <code className="font-mono text-base break-all">{enrolment.secret}</code>
                </div>
              </div>
              <form
                className="flex flex-col gap-4 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  void verify();
                }}
              >
                <Field id="mfa-enrol-code" label="6-digit code" className="sm:w-48">
                  <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                </Field>
                <Button type="submit" loading={busy}>Turn on</Button>
                <Button type="button" variant="ghost" onClick={() => { setEnrolment(null); setCode(''); }}>Cancel</Button>
              </form>
              {error && <Alert tone="danger" live="assertive">{error}</Alert>}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-ink-700">
                Add a second step to signing in, using an authenticator app on your phone. Someone who learns your password still cannot get in without your phone.
              </p>
              {sensitive && <Alert tone="warning">Your role can see personal or financial information. Two-step verification is strongly recommended.</Alert>}
              {error && <Alert tone="danger" live="assertive">{error}</Alert>}
              <Button className="self-start" loading={busy} onClick={() => void start()}>Set up two-step verification</Button>
            </div>
          )
        }
      </QueryState>
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove two-step verification?"
        description="Your account will be protected by your password only."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={async () => {
          if (!removing) return;
          const { error: unenrollError } = await db().auth.mfa.unenroll({ factorId: removing });
          if (unenrollError) throw new AppError('forbidden', auth.aal !== 'aal2' ? 'Sign in again with your code first, then try again.' : 'Two-step verification could not be removed. Please try again.');
          await refresh();
          toast.success('Two-step verification removed.');
        }}
      />
    </Card>
  );
}

export function AccountPage() {
  const auth = useAuth();
  const toast = useToast();
  const [changingPassword, setChangingPassword] = useState(false);
  return (
    <>
      <PageHeader title="Your account" description="Your sign-in details and security settings." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profile">
          <div className="flex flex-col gap-6">
            <NameForm />
            <KeyValue
              columns={1}
              items={[
                { label: 'Email address', value: auth.email },
                {
                  label: 'Roles',
                  value: auth.roles.length ? (
                    <ul className="mt-1 flex flex-col gap-2 font-normal">
                      {auth.roles.map((r) => (
                        <li key={r}>
                          <span className="font-medium">{ROLE_LABELS[r]}</span>
                          <span className="block text-sm text-ink-600">{ROLE_DESCRIPTIONS[r]}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    'No roles'
                  ),
                },
              ]}
            />
            <p className="text-sm text-ink-600">To change your email address or roles, ask an administrator.</p>
          </div>
        </Card>
        <div className="flex flex-col gap-6">
          <Card title="Password">
            {changingPassword ? (
              <PasswordForm
                submitLabel="Change password"
                onDone={() => {
                  setChangingPassword(false);
                  toast.success('Password changed.');
                }}
              />
            ) : (
              <Button variant="secondary" onClick={() => setChangingPassword(true)}>Change password</Button>
            )}
          </Card>
          <TwoStep />
        </div>
      </div>
    </>
  );
}

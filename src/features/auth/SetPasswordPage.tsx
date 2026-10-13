import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { LoadingBlock } from '@/components/ui/Spinner';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { supabase } from '@/lib/supabaseClient';
import { AuthShell } from './AuthShell';
import { authErrorMessage, PASSWORD_MIN_LENGTH, passwordProblems } from './passwordPolicy';
import { useAuth } from './useAuth';

export function PasswordForm({ submitLabel, onDone }: { submitLabel: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [nonce, setNonce] = useState('');
  const [needsNonce, setNeedsNonce] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const problems = passwordProblems(password);
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(undefined);
        if (problems.length) {
          setError(`Your password needs ${problems.join(', ')}.`);
          return;
        }
        if (password !== confirm) {
          setError('The two passwords do not match.');
          return;
        }
        if (!supabase) return;
        setBusy(true);
        const { error: updateError } = await supabase.auth.updateUser(needsNonce ? { password, nonce: nonce.trim() } : { password });
        if (updateError?.code === 'reauthentication_needed') {
          await supabase.auth.reauthenticate();
          setNeedsNonce(true);
          setBusy(false);
          setError('For your security, we have emailed you a confirmation code. Enter it below.');
          return;
        }
        setBusy(false);
        if (updateError) setError(authErrorMessage(updateError));
        else onDone();
      }}
    >
      {error && <Alert tone={needsNonce && !nonce ? 'info' : 'danger'} live="assertive">{error}</Alert>}
      <Field
        id="new-password"
        label="New password"
        required
        hint={`At least ${PASSWORD_MIN_LENGTH} characters, with upper and lower case letters and a number.`}
      >
        <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field id="confirm-password" label="Confirm new password" required>
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {needsNonce && (
        <Field id="reauth-nonce" label="Confirmation code from your email" required>
          <Input inputMode="numeric" autoComplete="one-time-code" value={nonce} onChange={(e) => setNonce(e.target.value)} />
        </Field>
      )}
      <Button type="submit" size="lg" loading={busy}>{submitLabel}</Button>
    </form>
  );
}

export function SetPasswordPage() {
  useDocumentTitle('Choose a password');
  const auth = useAuth();
  const navigate = useNavigate();
  const reason = (useLocation().state as { reason?: string } | null)?.reason;
  if (auth.initializing) return <AuthShell title="One moment…"><LoadingBlock /></AuthShell>;
  if (!auth.session) return <Navigate to="/admin/login" replace />;
  return (
    <AuthShell
      title={reason === 'invite' ? 'Welcome to PRAYASH' : 'Choose a new password'}
      description={reason === 'invite' ? 'Choose a password for your new team account.' : 'Enter a new password for your account.'}
    >
      <PasswordForm submitLabel="Save password" onDone={() => navigate('/admin', { replace: true, state: { notice: 'Your password has been saved.' } })} />
    </AuthShell>
  );
}

import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { isBackendConfigured } from '@/lib/env';
import { supabase } from '@/lib/supabaseClient';
import { AuthShell } from './AuthShell';
import { authErrorMessage } from './passwordPolicy';
import { useAuth } from './useAuth';

type LocationState = { from?: { pathname: string }; reason?: 'idle' | 'signed_out' } | null;

function MfaStep({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // Move focus to the code field when this step replaces the password form.
  useEffect(() => document.getElementById('mfa-code')?.focus(), []);
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!supabase) return;
        setBusy(true);
        setError(undefined);
        const factors = await supabase.auth.mfa.listFactors();
        const factor = factors.data?.totp?.find((f) => f.status === 'verified');
        if (!factor) {
          setBusy(false);
          setError('No authenticator app is set up for this account.');
          return;
        }
        const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
        setBusy(false);
        if (verifyError) setError(authErrorMessage(verifyError));
        else onDone();
      }}
    >
      <p className="text-ink-700">Enter the 6-digit code from your authenticator app.</p>
      {error && <Alert tone="danger" live="assertive">{error}</Alert>}
      <Field id="mfa-code" label="Authentication code" required>
        <Input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
      </Field>
      <Button type="submit" loading={busy} disabled={code.length !== 6}>Verify</Button>
    </form>
  );
}

export function LoginPage() {
  useDocumentTitle('Team sign-in');
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const from = state?.from?.pathname && state.from.pathname.startsWith('/admin') ? state.from.pathname : '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth.session && !auth.needsMfa && !auth.initializing && auth.aal) navigate(from, { replace: true });
  }, [auth.session, auth.needsMfa, auth.initializing, auth.aal, from, navigate]);

  if (!isBackendConfigured) {
    return (
      <AuthShell title="Team sign-in">
        <Alert tone="warning" title="Not connected">This website is not yet connected to its database. See docs/SUPABASE_SETUP.md.</Alert>
      </AuthShell>
    );
  }
  if (auth.session && auth.needsMfa) {
    return (
      <AuthShell title="Two-step verification">
        <MfaStep onDone={() => void auth.refresh().then(() => navigate(from, { replace: true }))} />
      </AuthShell>
    );
  }
  if (auth.session && !auth.initializing && auth.aal) return <Navigate to={from} replace />;

  return (
    <AuthShell title="Team sign-in" description="For PRAYASH team members and volunteers with an account.">
      <form
        className="flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!supabase) return;
          setBusy(true);
          setError(undefined);
          const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          setBusy(false);
          if (signInError) {
            setError(authErrorMessage(signInError));
            return;
          }
          await auth.refresh();
        }}
      >
        {state?.reason === 'idle' && <Alert tone="info">You were signed out after a period of inactivity.</Alert>}
        {error && <Alert tone="danger" live="assertive">{error}</Alert>}
        <Field id="login-email" label="Email address" required>
          <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field id="login-password" label="Password" required>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" size="lg" loading={busy} loadingLabel="Signing in…">Sign in</Button>
        <div className="flex flex-wrap justify-between gap-3 text-sm">
          <Link to="/admin/forgot-password" className="font-medium text-forest-700 underline-offset-4 hover:underline">Forgot your password?</Link>
          <Link to="/" className="text-ink-600 hover:text-ink-900">Back to the website</Link>
        </div>
        <p className="text-sm text-ink-600">Accounts are created by PRAYASH administrators. There is no public sign-up.</p>
      </form>
    </AuthShell>
  );
}

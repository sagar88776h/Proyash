import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { siteOrigin } from '@/lib/env';
import { supabase } from '@/lib/supabaseClient';
import { AuthShell } from './AuthShell';
import { authErrorMessage } from './passwordPolicy';

export function ForgotPasswordPage() {
  useDocumentTitle('Reset password');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <AuthShell title="Reset your password" description="Enter the email address of your PRAYASH team account.">
      {sent ? (
        <div className="flex flex-col gap-5">
          <Alert tone="success" title="Check your email">
            If an account exists for {email}, we have sent a link to reset the password. The link expires after a short time.
          </Alert>
          <Link to="/admin/login" className="font-medium text-forest-700 underline-offset-4 hover:underline">Back to sign-in</Link>
        </div>
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!supabase) return;
            setBusy(true);
            setError(undefined);
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
              redirectTo: `${siteOrigin()}/admin/auth/confirm`,
            });
            setBusy(false);
            // Same response whether or not the account exists (no account enumeration).
            if (resetError && (resetError.status === 429 || /fetch/i.test(resetError.message))) setError(authErrorMessage(resetError));
            else setSent(true);
          }}
        >
          {error && <Alert tone="danger" live="assertive">{error}</Alert>}
          <Field id="reset-email" label="Email address" required>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button type="submit" size="lg" loading={busy}>Send reset link</Button>
          <Link to="/admin/login" className="text-sm font-medium text-forest-700 underline-offset-4 hover:underline">Back to sign-in</Link>
        </form>
      )}
    </AuthShell>
  );
}

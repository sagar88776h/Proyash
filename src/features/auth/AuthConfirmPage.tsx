import type { EmailOtpType } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert } from '@/components/ui/Feedback';
import { LoadingBlock } from '@/components/ui/Spinner';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { supabase } from '@/lib/supabaseClient';
import { AuthShell } from './AuthShell';
import { authErrorMessage } from './passwordPolicy';

const ALLOWED_TYPES: EmailOtpType[] = ['invite', 'recovery', 'email_change', 'email'];

/** Landing page for links in invitation, recovery and email-change emails. */
export function AuthConfirmPage() {
  useDocumentTitle('Confirming');
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !supabase) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const type = params.get('type') as EmailOtpType | null;
    // Remove the one-time token from the address bar and history straight away.
    window.history.replaceState(null, '', '/admin/auth/confirm');

    async function run() {
      if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
        const { error: verifyError } = await supabase!.auth.verifyOtp({ token_hash: tokenHash, type });
        if (verifyError) {
          setError(authErrorMessage(verifyError));
          return;
        }
        if (type === 'invite' || type === 'recovery') navigate('/admin/set-password', { replace: true, state: { reason: type } });
        else navigate('/admin', { replace: true });
        return;
      }
      // PKCE (?code=) links are exchanged automatically by supabase-js.
      const { data } = await supabase!.auth.getSession();
      if (data.session) navigate('/admin/set-password', { replace: true, state: { reason: 'recovery' } });
      else setError('This link is not valid. It may have expired or already been used.');
    }
    void run();
  }, [navigate]);

  return (
    <AuthShell title={error ? 'Link not valid' : 'One moment…'}>
      {error ? (
        <div className="flex flex-col gap-5">
          <Alert tone="danger">{error}</Alert>
          <p className="text-ink-700">
            For a password reset, <Link to="/admin/forgot-password" className="font-medium text-forest-700 underline">request a new link</Link>. For an expired invitation, ask an administrator to send a new one.
          </p>
        </div>
      ) : (
        <LoadingBlock label="Confirming your link" />
      )}
    </AuthShell>
  );
}

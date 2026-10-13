import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Spinner';
import { AuthShell } from './AuthShell';
import type { AppRole } from './AuthProvider';
import { useAuth } from './useAuth';

/** Requires a signed-in, active account with at least one role. UI convenience only — the database enforces access. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.initializing) return <LoadingBlock className="min-h-svh" label="Loading" />;
  if (!auth.session || auth.needsMfa) return <Navigate to="/admin/login" replace state={{ from: location }} />;
  if (auth.rolesLoading) return <LoadingBlock className="min-h-svh" label="Loading your account" />;
  if (!auth.isActive || auth.roles.length === 0) {
    return (
      <AuthShell title="No access yet" description="Your account does not currently have any role in the PRAYASH portal.">
        <p className="mb-6 text-ink-700">If you think this is a mistake, ask a PRAYASH administrator to check your account.</p>
        <Button variant="secondary" onClick={() => void auth.signOut()}>Sign out</Button>
      </AuthShell>
    );
  }
  return <>{children}</>;
}

/** Shows a friendly message instead of a page the user's roles do not cover. */
export function RequireRole({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const auth = useAuth();
  if (!auth.hasRole(...roles)) {
    return (
      <div className="rounded-card border border-ink-100 bg-ivory-50 p-10 text-center">
        <h1 className="font-display text-2xl font-semibold">You do not have access to this page</h1>
        <p className="mt-2 text-ink-600">Ask an administrator if you need this permission.</p>
      </div>
    );
  }
  return <>{children}</>;
}

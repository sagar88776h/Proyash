import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabaseClient';
import { AuthContext, type AppRole, type AuthState } from './authContext';

export type { AppRole, AuthState } from './authContext';

type Level = 'aal1' | 'aal2' | null;
type AalState = { token: string | null; current: Level; next: Level };

async function readAal(token: string): Promise<AalState> {
  const { data } = await supabase!.auth.mfa.getAuthenticatorAssuranceLevel();
  return { token, current: (data?.currentLevel as Level) ?? null, next: (data?.nextLevel as Level) ?? null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(Boolean(supabase));
  // Assurance level, tagged with the access token it was read from so a stale
  // value is never applied to a newer session.
  const [aalState, setAal] = useState<AalState>({ token: null, current: null, next: null });

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setInitializing(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') queryClient.clear();
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const token = session?.access_token ?? null;
  useEffect(() => {
    if (!supabase || !token) return;
    let mounted = true;
    void readAal(token).then((next) => {
      if (mounted) setAal(next);
    });
    return () => {
      mounted = false;
    };
  }, [token]);
  const aal = token && aalState.token === token ? aalState : { current: null, next: null };

  const userId = session?.user.id ?? null;
  const profile = useQuery({
    queryKey: ['auth', 'profile', userId, aal.current],
    enabled: Boolean(supabase && userId),
    staleTime: 60_000,
    queryFn: async () => {
      const [roles, me] = await Promise.all([
        supabase!.rpc('my_roles'),
        supabase!.from('profiles').select('full_name, is_active').eq('id', userId!).maybeSingle(),
      ]);
      return { roles: (unwrap(roles) ?? []) as AppRole[], profile: unwrap(me) };
    },
  });

  const roles = useMemo(() => profile.data?.roles ?? [], [profile.data]);
  const hasRole = useCallback((...wanted: AppRole[]) => wanted.some((r) => roles.includes(r)), [roles]);

  const value: AuthState = {
    session,
    initializing,
    userId,
    email: session?.user.email ?? null,
    fullName: profile.data?.profile?.full_name || session?.user.user_metadata?.full_name || '',
    roles,
    rolesLoading: profile.isLoading && Boolean(userId),
    isActive: profile.data?.profile?.is_active ?? true,
    aal: aal.current,
    needsMfa: aal.current === 'aal1' && aal.next === 'aal2',
    hasRole,
    refresh: async () => {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session) setAal(await readAal(data.session.access_token));
      }
      await queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
    signOut: async () => {
      await supabase?.auth.signOut();
      queryClient.clear();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

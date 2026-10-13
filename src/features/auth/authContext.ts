import type { Session } from '@supabase/supabase-js';
import { createContext } from 'react';
import type { Enums } from '@/types/database';

export type AppRole = Enums<'app_role'>;

export type AuthState = {
  session: Session | null;
  /** True until the stored session (if any) has been restored. */
  initializing: boolean;
  userId: string | null;
  email: string | null;
  fullName: string;
  roles: AppRole[];
  rolesLoading: boolean;
  isActive: boolean;
  /** Assurance level of the current session ('aal1' password, 'aal2' with MFA). */
  aal: 'aal1' | 'aal2' | null;
  needsMfa: boolean;
  hasRole: (...roles: AppRole[]) => boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

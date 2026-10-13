import { Outlet } from 'react-router';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { AdminLayout } from './AdminLayout';
import { ToastProvider } from './components/Toasts';

/** Root of /admin: authentication state and notifications. */
export function AdminRoot() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </AuthProvider>
  );
}

/** Signed-in area with the portal layout. */
export function ProtectedArea() {
  return (
    <RequireAuth>
      <AdminLayout />
    </RequireAuth>
  );
}

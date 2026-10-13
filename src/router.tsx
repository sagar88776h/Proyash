import { createBrowserRouter } from 'react-router';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { RouteError } from '@/components/RouteError';
import { HomePage } from '@/features/public/home/HomePage';
import { NotFoundPage } from '@/features/public/NotFoundPage';

/** Lazily loads a named export as a route component. */
function page<M extends Record<string, unknown>>(loader: () => Promise<M>, name: keyof M) {
  return async () => {
    const mod = await loader();
    return { Component: mod[name] as React.ComponentType };
  };
}

type Role = 'admin' | 'treasurer' | 'assistance_reviewer' | 'volunteer_coordinator' | 'publisher' | 'volunteer';

/** Lazily loads an admin page and wraps it in a role check (the database enforces access regardless). */
function adminPage<M extends Record<string, unknown>>(roles: Role[], loader: () => Promise<M>, name: keyof M) {
  return async () => {
    const [mod, guard] = await Promise.all([loader(), import('@/features/auth/RequireAuth')]);
    const Inner = mod[name] as React.ComponentType;
    const Component = () => (
      <guard.RequireRole roles={roles}>
        <Inner />
      </guard.RequireRole>
    );
    return { Component };
  };
}

const STAFF: Role[] = ['admin', 'treasurer', 'assistance_reviewer', 'volunteer_coordinator', 'publisher', 'volunteer'];
const REVIEW: Role[] = ['admin', 'assistance_reviewer'];
const COORD: Role[] = ['admin', 'volunteer_coordinator'];
const PROGRAMMES: Role[] = ['admin', 'publisher', 'volunteer_coordinator'];
const FINANCE: Role[] = ['admin', 'treasurer'];
const CONTENT: Role[] = ['admin', 'publisher'];
const ADMIN: Role[] = ['admin'];

const adminRoutes = {
  path: 'admin',
  lazy: page(() => import('@/features/admin/AdminRoot'), 'AdminRoot'),
  errorElement: <RouteError />,
  children: [
    { path: 'login', lazy: page(() => import('@/features/auth/LoginPage'), 'LoginPage') },
    { path: 'forgot-password', lazy: page(() => import('@/features/auth/ForgotPasswordPage'), 'ForgotPasswordPage') },
    { path: 'auth/confirm', lazy: page(() => import('@/features/auth/AuthConfirmPage'), 'AuthConfirmPage') },
    { path: 'set-password', lazy: page(() => import('@/features/auth/SetPasswordPage'), 'SetPasswordPage') },
    {
      lazy: page(() => import('@/features/admin/AdminRoot'), 'ProtectedArea'),
      children: [
        { index: true, lazy: adminPage(STAFF, () => import('@/features/admin/overview/OverviewPage'), 'OverviewPage') },
        { path: 'requests', lazy: adminPage(REVIEW, () => import('@/features/admin/requests/RequestsListPage'), 'RequestsListPage') },
        { path: 'requests/new', lazy: adminPage(REVIEW, () => import('@/features/admin/requests/NewRequestPage'), 'NewRequestPage') },
        { path: 'requests/:id', lazy: adminPage(REVIEW, () => import('@/features/admin/requests/RequestDetailPage'), 'RequestDetailPage') },
        { path: 'volunteers', lazy: adminPage(COORD, () => import('@/features/admin/volunteers/VolunteersListPage'), 'VolunteersListPage') },
        { path: 'volunteers/:id', lazy: adminPage(COORD, () => import('@/features/admin/volunteers/VolunteerDetailPage'), 'VolunteerDetailPage') },
        { path: 'my-assignments', lazy: adminPage(['volunteer'], () => import('@/features/admin/volunteers/MyAssignmentsPage'), 'MyAssignmentsPage') },
        { path: 'projects', lazy: adminPage(PROGRAMMES, () => import('@/features/admin/projects/ProjectsListPage'), 'ProjectsListPage') },
        { path: 'projects/new', lazy: adminPage(PROGRAMMES, () => import('@/features/admin/projects/ProjectEditorPage'), 'ProjectEditorPage') },
        { path: 'projects/:id', lazy: adminPage(PROGRAMMES, () => import('@/features/admin/projects/ProjectEditorPage'), 'ProjectEditorPage') },
        { path: 'villages', lazy: adminPage(PROGRAMMES, () => import('@/features/admin/villages/VillagesAdminPage'), 'VillagesAdminPage') },
        { path: 'media', lazy: adminPage(PROGRAMMES, () => import('@/features/admin/media/MediaLibraryPage'), 'MediaLibraryPage') },
        { path: 'finance', lazy: adminPage(FINANCE, () => import('@/features/admin/finance/FinanceOverviewPage'), 'FinanceOverviewPage') },
        { path: 'finance/ledger', lazy: adminPage(FINANCE, () => import('@/features/admin/finance/LedgerPage'), 'LedgerPage') },
        { path: 'finance/new', lazy: adminPage(FINANCE, () => import('@/features/admin/finance/NewEntryPage'), 'NewEntryPage') },
        { path: 'finance/entries/:id', lazy: adminPage(FINANCE, () => import('@/features/admin/finance/EntryDetailPage'), 'EntryDetailPage') },
        { path: 'finance/entries/:id/receipt', lazy: adminPage(FINANCE, () => import('@/features/admin/finance/ReceiptPage'), 'ReceiptPage') },
        { path: 'finance/accounts', lazy: adminPage(FINANCE, () => import('@/features/admin/finance/AccountsPage'), 'AccountsPage') },
        { path: 'finance/reconciliation', lazy: adminPage(FINANCE, () => import('@/features/admin/finance/ReconciliationPage'), 'ReconciliationPage') },
        { path: 'finance/reports', lazy: adminPage(FINANCE, () => import('@/features/admin/finance/ReportsPage'), 'ReportsPage') },
        { path: 'finance/reports/:id', lazy: adminPage(FINANCE, () => import('@/features/admin/finance/ReportEditorPage'), 'ReportEditorPage') },
        { path: 'content', lazy: adminPage(CONTENT, () => import('@/features/admin/content/ContentListPage'), 'ContentListPage') },
        { path: 'content/:key', lazy: adminPage(CONTENT, () => import('@/features/admin/content/ContentEditorPage'), 'ContentEditorPage') },
        { path: 'messages', lazy: adminPage(ADMIN, () => import('@/features/admin/messages/MessagesPage'), 'MessagesPage') },
        { path: 'settings', lazy: adminPage(ADMIN, () => import('@/features/admin/settings/SettingsPage'), 'SettingsPage') },
        { path: 'users', lazy: adminPage(ADMIN, () => import('@/features/admin/users/UsersPage'), 'UsersPage') },
        { path: 'audit', lazy: adminPage(FINANCE, () => import('@/features/admin/audit/AuditLogPage'), 'AuditLogPage') },
        { path: 'account', lazy: adminPage(STAFF, () => import('@/features/admin/account/AccountPage'), 'AccountPage') },
        { path: '*', lazy: adminPage(STAFF, () => import('@/features/admin/AdminNotFound'), 'AdminNotFound') },
      ],
    },
  ],
};

export const routes = [
  adminRoutes,
  {
    element: <PublicLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'about', lazy: page(() => import('@/features/public/about/AboutPage'), 'AboutPage') },
      { path: 'our-work', lazy: page(() => import('@/features/public/work/OurWorkPage'), 'OurWorkPage') },
      { path: 'our-work/:slug', lazy: page(() => import('@/features/public/work/ProjectPage'), 'ProjectPage') },
      { path: 'villages', lazy: page(() => import('@/features/public/villages/VillagesPage'), 'VillagesPage') },
      { path: 'villages/:slug', lazy: page(() => import('@/features/public/villages/VillagePage'), 'VillagePage') },
      { path: 'request-help', lazy: page(() => import('@/features/public/help/RequestHelpPage'), 'RequestHelpPage') },
      { path: 'request-help/status', lazy: page(() => import('@/features/public/help/RequestStatusPage'), 'RequestStatusPage') },
      { path: 'support-us', lazy: page(() => import('@/features/public/donate/DonatePage'), 'DonatePage') },
      { path: 'donate', lazy: page(() => import('@/features/public/donate/DonatePage'), 'DonatePage') },
      { path: 'volunteer', lazy: page(() => import('@/features/public/volunteer/VolunteerPage'), 'VolunteerPage') },
      { path: 'transparency', lazy: page(() => import('@/features/public/transparency/TransparencyPage'), 'TransparencyPage') },
      { path: 'transparency/:id', lazy: page(() => import('@/features/public/transparency/ReportPage'), 'ReportPage') },
      { path: 'contact', lazy: page(() => import('@/features/public/contact/ContactPage'), 'ContactPage') },
      { path: 'privacy', lazy: page(() => import('@/features/public/legal/LegalPage'), 'PrivacyPage') },
      { path: 'terms', lazy: page(() => import('@/features/public/legal/LegalPage'), 'TermsPage') },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);

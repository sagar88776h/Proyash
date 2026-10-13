import {
  BookOpenText,
  ClipboardList,
  FileBarChart,
  FileText,
  HandCoins,
  HandHeart,
  History,
  Images,
  Inbox,
  LayoutDashboard,
  Landmark,
  ListChecks,
  MapPinned,
  NotebookPen,
  Scale,
  Settings,
  UserCog,
  UserRound,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import type { AppRole } from '@/features/auth/AuthProvider';

export type NavItem = { to: string; label: string; icon: LucideIcon; roles: AppRole[]; end?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

const ALL: AppRole[] = ['admin', 'treasurer', 'assistance_reviewer', 'volunteer_coordinator', 'publisher', 'volunteer'];

export const ADMIN_NAV: NavGroup[] = [
  { label: '', items: [{ to: '/admin', label: 'Overview', icon: LayoutDashboard, roles: ALL, end: true }] },
  {
    label: 'Assistance',
    items: [{ to: '/admin/requests', label: 'Requests for help', icon: HandHeart, roles: ['admin', 'assistance_reviewer'] }],
  },
  {
    label: 'People',
    items: [
      { to: '/admin/volunteers', label: 'Volunteers', icon: Users, roles: ['admin', 'volunteer_coordinator'] },
      { to: '/admin/my-assignments', label: 'My assignments', icon: ListChecks, roles: ['volunteer'] },
    ],
  },
  {
    label: 'Programmes',
    items: [
      { to: '/admin/projects', label: 'Projects', icon: ClipboardList, roles: ['admin', 'publisher', 'volunteer_coordinator'] },
      { to: '/admin/villages', label: 'Villages', icon: MapPinned, roles: ['admin', 'publisher', 'volunteer_coordinator'] },
      { to: '/admin/media', label: 'Photo library', icon: Images, roles: ['admin', 'publisher', 'volunteer_coordinator'] },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/admin/finance', label: 'Finance overview', icon: WalletCards, roles: ['admin', 'treasurer'], end: true },
      { to: '/admin/finance/ledger', label: 'Ledger', icon: BookOpenText, roles: ['admin', 'treasurer'] },
      { to: '/admin/finance/new', label: 'Record an entry', icon: NotebookPen, roles: ['admin', 'treasurer'] },
      { to: '/admin/finance/accounts', label: 'Accounts', icon: Landmark, roles: ['admin', 'treasurer'] },
      { to: '/admin/finance/reconciliation', label: 'Reconciliation', icon: Scale, roles: ['admin', 'treasurer'] },
      { to: '/admin/finance/reports', label: 'Reports', icon: FileBarChart, roles: ['admin', 'treasurer'] },
    ],
  },
  {
    label: 'Website',
    items: [
      { to: '/admin/content', label: 'Page content', icon: FileText, roles: ['admin', 'publisher'] },
      { to: '/admin/messages', label: 'Messages', icon: Inbox, roles: ['admin'] },
      { to: '/admin/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/admin/users', label: 'Users & roles', icon: UserCog, roles: ['admin'] },
      { to: '/admin/audit', label: 'Audit history', icon: History, roles: ['admin', 'treasurer'] },
    ],
  },
  { label: 'You', items: [{ to: '/admin/account', label: 'Your account', icon: UserRound, roles: ALL }] },
];

export const FINANCE_ICON = HandCoins;

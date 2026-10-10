import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  DatabaseBackup,
  FileText,
  FolderOpen,
  GraduationCap,
  Landmark,
  MapPin,
  Medal,
  Receipt,
  ScanLine,
  Settings,
  ShieldCheck,
  Trophy,
  UserCheck,
  Users,
  UsersRound,
  Wallet,
  Bell,
  CircleDollarSign,
  KeyRound,
  Layers,
  ScrollText,
  LayoutDashboard,
  CreditCard,
  BadgeDollarSign,
} from 'lucide-react';

export interface NavItem {
  /** Route path (without locale prefix). */
  href: string;
  /** Translation key under the `nav` namespace. */
  labelKey: string;
  icon: LucideIcon;
  /** Permission code(s); item hidden when user has none. Empty = always visible. */
  permissions?: string[];
}

export interface NavSection {
  /** Translation key under the `nav` namespace. */
  labelKey: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: 'sectionOperations',
    items: [
      { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
      { href: '/calendar', labelKey: 'calendar', icon: CalendarDays, permissions: ['sessions.view'] },
      { href: '/attendance', labelKey: 'attendance', icon: UserCheck, permissions: ['attendance.view'] },
      { href: '/scan', labelKey: 'scan', icon: ScanLine, permissions: ['attendance.view', 'attendance.create'] },
    ],
  },
  {
    labelKey: 'sectionPeople',
    items: [
      { href: '/athletes', labelKey: 'athletes', icon: Users, permissions: ['athletes.view'] },
      { href: '/parents', labelKey: 'parents', icon: UsersRound, permissions: ['parents.view'] },
      { href: '/groups', labelKey: 'groups', icon: Layers, permissions: ['groups.view'] },
      { href: '/coaches', labelKey: 'coaches', icon: GraduationCap, permissions: ['coaches.view'] },
      { href: '/venues', labelKey: 'venues', icon: MapPin, permissions: ['venues.view'] },
      { href: '/sports', labelKey: 'sports', icon: Trophy, permissions: ['sports.view'] },
      { href: '/age-categories', labelKey: 'ageCategories', icon: Medal, permissions: ['age_categories.view'] },
    ],
  },
  {
    labelKey: 'sectionFinance',
    items: [
      { href: '/subscriptions', labelKey: 'subscriptions', icon: CreditCard, permissions: ['subscriptions.view'] },
      { href: '/payments', labelKey: 'payments', icon: Receipt, permissions: ['payments.view'] },
      { href: '/expenses', labelKey: 'expenses', icon: BadgeDollarSign, permissions: ['expenses.view'] },
      { href: '/cash', labelKey: 'cash', icon: Wallet, permissions: ['cash.view'] },
      { href: '/reports', labelKey: 'reports', icon: BarChart3, permissions: ['reports.view'] },
    ],
  },
  {
    labelKey: 'sectionOperations',
    items: [
      { href: '/evaluations', labelKey: 'evaluations', icon: ClipboardCheck, permissions: ['evaluations.view'] },
      { href: '/documents', labelKey: 'documents', icon: FolderOpen, permissions: ['documents.view'] },
      { href: '/notifications', labelKey: 'notifications', icon: Bell, permissions: ['notifications.view'] },
    ],
  },
  {
    labelKey: 'sectionAdmin',
    items: [
      { href: '/users', labelKey: 'users', icon: ShieldCheck, permissions: ['users.manage'] },
      { href: '/roles', labelKey: 'roles', icon: KeyRound, permissions: ['roles.manage'] },
      { href: '/settings', labelKey: 'settings', icon: Settings, permissions: ['settings.manage'] },
      { href: '/audit-logs', labelKey: 'audit', icon: ScrollText, permissions: ['audit.view'] },
      { href: '/backups', labelKey: 'backups', icon: DatabaseBackup, permissions: ['backup.manage'] },
    ],
  },
];

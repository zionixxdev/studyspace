import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  CalendarDays,
  Clock,
  Folder,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Settings,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useUnread } from '@/hooks/useUnread';
import { ThemeToggle } from './ThemeToggle';
import { Avatar } from '@/components/ui/Feedback';

interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  badgeKey?: 'messages' | 'notifications' | 'people';
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/messages', label: 'Messages', Icon: MessageCircle, badgeKey: 'messages' },
  { to: '/people', label: 'People', Icon: Users, badgeKey: 'people' },
  { to: '/communities', label: 'Communities', Icon: UsersRound },
  { to: '/rooms', label: 'Study rooms', Icon: BookOpen },
  { to: '/files', label: 'Files', Icon: Folder },
  { to: '/tasks', label: 'Tasks', Icon: CalendarDays },
  { to: '/focus', label: 'Focus', Icon: Clock },
  { to: '/notifications', label: 'Notifications', Icon: Bell, badgeKey: 'notifications' },
  { to: '/search', label: 'Search', Icon: Search },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

// The mobile bottom bar shows the most-used destinations only.
const MOBILE = ['/', '/messages', '/communities', '/rooms', '/tasks'];

export function AppShell() {
  const { profile, signOut } = useAuth();
  const { data: unread } = useUnread();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const badgeFor = (item: NavItem): number => {
    if (!unread || !item.badgeKey) return 0;
    if (item.badgeKey === 'messages') return unread.unread_messages;
    if (item.badgeKey === 'notifications') return unread.unread_notifications;
    return unread.pending_requests;
  };

  const navList = (
    <nav className="flex flex-col gap-1" aria-label="Primary">
      {NAV.map((item) => {
        const count = badgeFor(item);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-content-muted hover:bg-surface-muted hover:text-content',
              )
            }
          >
            <item.Icon className="h-[18px] w-[18px]" aria-hidden={true} />
            <span className="flex-1">{item.label}</span>
            {count > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-4 p-4 lg:flex">
        <div className="flex items-center gap-2 px-2 py-1">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 font-bold text-white">
            S
          </span>
          <span className="text-lg font-semibold tracking-tight">StudySpace</span>
        </div>
        {navList}
        <div className="mt-auto flex flex-col gap-3">
          <ThemeToggle />
          <div className="glass flex items-center gap-3 rounded-xl p-2.5">
            <Avatar name={profile?.display_name ?? 'Student'} src={profile?.avatar_url} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile?.display_name ?? 'Student'}</p>
              <p className="truncate text-xs text-content-muted">@{profile?.username ?? '…'}</p>
            </div>
            <button
              onClick={() => signOut().then(() => navigate('/login'))}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-lg p-1.5 text-content-muted hover:bg-surface-muted hover:text-content"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="glass-strong absolute left-0 top-0 h-full w-72 p-4 animate-slide-up">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-lg font-semibold">StudySpace</span>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="p-1.5">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {navList}
            <div className="mt-4">
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="glass sticky top-0 z-30 flex items-center gap-3 px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="p-1.5">
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="font-semibold">StudySpace</span>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 pb-24 pt-4 lg:px-8 lg:pb-8">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="glass-strong fixed inset-x-0 bottom-0 z-30 flex items-center justify-around px-2 py-1.5 lg:hidden"
          aria-label="Primary mobile"
        >
          {NAV.filter((n) => MOBILE.includes(n.to)).map((item) => {
            const count = badgeFor(item);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'relative flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[11px] font-medium',
                    isActive ? 'text-brand-500' : 'text-content-muted',
                  )
                }
              >
                <item.Icon className="h-5 w-5" aria-hidden={true} />
                {item.label.split(' ')[0]}
                {count > 0 && (
                  <span className="absolute right-1 top-0 h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  Bell, ChevronDown, ClipboardCheck, FileSearch, FolderOpen, Gavel, Home, LogOut, Menu as MenuIcon,
  Search, ShieldCheck, Tags, Upload, Users, Workflow, X, Archive,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useCan, useSession } from '@/features/auth/session';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/Menu';
import { Button } from '@/components/ui/Button';
import { initials, roleLabel } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useUploadDialog } from '@/features/explorer/uploadStore';
import { UploadDialog } from '@/features/explorer/UploadDialog';

interface NavItem { to: string; label: string; icon: ReactNode; capability?: string }
interface NavSection { id: string; label: string; icon: ReactNode; items: NavItem[] }

/** Navigation mirrors the reference screens' sections; items appear only if the user may use them. */
const SECTIONS: NavSection[] = [
  {
    id: 'filing', label: 'Filing', icon: <FolderOpen className="size-4" />,
    items: [
      { to: '/explorer', label: 'File explorer', icon: <FolderOpen className="size-4" />, capability: 'cabinets:read' },
    ],
  },
  {
    id: 'locating', label: 'Locating', icon: <FileSearch className="size-4" />,
    items: [
      { to: '/search', label: 'Content search', icon: <Search className="size-4" />, capability: 'documents:read' },
    ],
  },
  {
    id: 'workflows', label: 'Workflows', icon: <Workflow className="size-4" />,
    items: [
      { to: '/tasks', label: 'My reviews', icon: <ClipboardCheck className="size-4" />, capability: 'workflows:participate' },
      { to: '/admin/workflows', label: 'Workflow designs', icon: <Workflow className="size-4" />, capability: 'workflows:manage' },
    ],
  },
  {
    id: 'admin', label: 'Administration', icon: <ShieldCheck className="size-4" />,
    items: [
      { to: '/admin/users', label: 'Users', icon: <Users className="size-4" />, capability: 'users:read' },
      { to: '/admin/document-types', label: 'Document types', icon: <Tags className="size-4" />, capability: 'document_types:manage' },
      { to: '/admin/retention', label: 'Retention', icon: <Archive className="size-4" />, capability: 'retention:manage' },
      { to: '/admin/legal-holds', label: 'Legal holds', icon: <Gavel className="size-4" />, capability: 'legal_holds:manage' },
    ],
  },
];

function useVisibleSections(): NavSection[] {
  const perms = useSession((s) => s.user?.permissions ?? []);
  return SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.capability || perms.includes(i.capability)) }))
    .filter((s) => s.items.length > 0);
}

export function AppShell() {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  useEffect(() => setDrawer(false), [location.pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <TopBar onMenu={() => setDrawer(true)} />
      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100dvh-56px)] w-64 shrink-0 overflow-y-auto border-r border-rule bg-surface lg:block">
          <Sidebar />
        </aside>
        {drawer ? (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <button className="absolute inset-0 bg-navy-950/40" aria-label="Close navigation" onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-surface shadow-pop">
              <div className="flex h-14 items-center justify-between border-b border-rule px-4">
                <span className="doc-title text-lg">Menu</span>
                <button className="rounded p-1 hover:bg-navy-50" onClick={() => setDrawer(false)} aria-label="Close navigation"><X className="size-5" /></button>
              </div>
              <Sidebar />
            </aside>
          </div>
        ) : null}
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
        <UploadDialog />
      </div>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);
  const canUpload = useCan('documents:upload');
  const openUpload = useUploadDialog((s) => s.show);
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-navy-800 px-3 text-white sm:px-5">
      <button className="rounded p-1.5 hover:bg-white/10 lg:hidden" onClick={onMenu} aria-label="Open navigation">
        <MenuIcon className="size-5" />
      </button>
      <Link to="/" className="flex items-center gap-2.5 rounded pr-2" aria-label="ManageEDocs home">
        <span className="grid size-8 place-items-center rounded-md bg-manila-300" aria-hidden>
          <FolderOpen className="size-[18px] text-navy-800" strokeWidth={2.25} />
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-[15px] font-semibold tracking-tight">ManageEDocs</span>
          <span className="block max-w-56 truncate text-[11.5px] text-white/65">{user?.organisation.name}</span>
        </span>
      </Link>

      <form onSubmit={submit} role="search" className="ml-auto flex max-w-md flex-1 items-center">
        <label htmlFor="quick-search" className="sr-only">Search documents</label>
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-white/60" aria-hidden />
          <input
            id="quick-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a document by name or content"
            className="h-9 w-full rounded-md border border-white/15 bg-white/10 pl-8 pr-3 text-sm text-white placeholder:text-white/55 focus:border-white/40 focus:bg-white/15 focus:outline-none"
          />
        </div>
      </form>

      {canUpload ? (
        <Button variant="onNavy" size="md" icon={<Upload className="size-4" />} onClick={() => openUpload()} className="hidden sm:inline-flex">
          Upload
        </Button>
      ) : null}

      <NotificationBell />

      <Menu>
        <MenuTrigger className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-white/10" aria-label="Account">
          <span className="grid size-8 place-items-center rounded-full bg-white/15 text-[12px] font-semibold">{initials(user?.fullName ?? '')}</span>
          <ChevronDown className="hidden size-4 text-white/70 sm:block" aria-hidden />
        </MenuTrigger>
        <MenuContent>
          <MenuLabel>
            <span className="block text-sm font-medium text-ink">{user?.fullName}</span>
            <span className="block">{user?.email}</span>
            <span className="block">{user ? roleLabel(user.role) : ''}, {user?.organisation.name}</span>
          </MenuLabel>
          <MenuSeparator />
          <MenuItem icon={<LogOut className="size-4" />} onSelect={() => void signOut()}>Sign out</MenuItem>
        </MenuContent>
      </Menu>
    </header>
  );
}

function NotificationBell() {
  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get<{ unread: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  const unread = data?.unread ?? 0;
  return (
    <Link
      to="/notifications"
      className="relative rounded-md p-2 hover:bg-white/10"
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <Bell className="size-5" />
      {unread > 0 ? (
        <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10.5px] font-semibold leading-4">
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  );
}

function Sidebar() {
  const sections = useVisibleSections();
  const location = useLocation();
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SECTIONS.map((s) => [s.id, true])),
  );
  const canUpload = useCan('documents:upload');
  const openUpload = useUploadDialog((s) => s.show);

  return (
    <nav aria-label="Main" className="flex h-full flex-col py-3">
      <NavLink to="/" end className={({ isActive }) => navLinkClass(isActive, 'mx-2 mb-2')}>
        <Home className="size-4" /> Home
      </NavLink>
      {sections.map((s) => {
        const expanded = open[s.id] ?? true;
        const containsActive = s.items.some((i) => location.pathname.startsWith(i.to));
        return (
          <div key={s.id} className="mx-2 mb-1">
            <button
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-semibold text-ink hover:bg-navy-50"
              aria-expanded={expanded}
              onClick={() => setOpen((o) => ({ ...o, [s.id]: !expanded }))}
            >
              <span className={cn(containsActive ? 'text-navy-800' : 'text-muted')}>{s.icon}</span>
              {s.label}
              <ChevronDown className={cn('ml-auto size-4 text-subtle transition-transform', !expanded && '-rotate-90')} aria-hidden />
            </button>
            {expanded ? (
              <ul className="mt-0.5 space-y-px pl-4">
                {s.items.map((i) => (
                  <li key={i.to}>
                    <NavLink to={i.to} className={({ isActive }) => navLinkClass(isActive)}>{i.icon}{i.label}</NavLink>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}

      {/* Quick actions, as in the reference sidebar's tile grid — only actions that exist for this user. */}
      <div className="mt-auto border-t border-rule px-3 pt-3">
        <p className="mb-2 px-1 text-[12px] text-muted">Quick actions</p>
        <div className="grid grid-cols-2 gap-1.5">
          {canUpload ? <QuickTile icon={<Upload className="size-4" />} label="Upload" onClick={() => openUpload()} /> : null}
          <QuickTile icon={<FolderOpen className="size-4" />} label="Explorer" to="/explorer" />
          <QuickTile icon={<Search className="size-4" />} label="Search" to="/search" />
          <QuickTile icon={<ClipboardCheck className="size-4" />} label="Reviews" to="/tasks" />
        </div>
      </div>
    </nav>
  );
}

function QuickTile({ icon, label, to, onClick }: { icon: ReactNode; label: string; to?: string; onClick?: () => void }) {
  const cls = 'flex items-center gap-2 rounded-md bg-navy-800 px-2.5 py-2 text-[12.5px] font-medium text-white hover:bg-navy-700';
  return to ? <Link to={to} className={cls}>{icon}{label}</Link> : <button className={cls} onClick={onClick}>{icon}{label}</button>;
}

function navLinkClass(active: boolean, extra = '') {
  return cn(
    'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13.5px]',
    active ? 'bg-navy-100 font-medium text-navy-800' : 'text-muted hover:bg-navy-50 hover:text-ink',
    extra,
  );
}

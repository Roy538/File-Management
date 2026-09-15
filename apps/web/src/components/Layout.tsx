import { useState, useEffect } from 'react';
import { ReactNode } from 'react';
import { Link, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { NotificationBell } from './NotificationBell';
import { GlobalSearch } from './GlobalSearch';

// ── SVG Icon set ──────────────────────────────────────────────────────────────

function Icon({ d, className = 'w-5 h-5' }: { d: string | string[]; className?: string }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
      {paths.map((p, i) => <path key={i} strokeLinecap="round" strokeLinejoin="round" d={p} />)}
    </svg>
  );
}

const ICONS = {
  dashboard:  'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  inventory:  ['M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4', 'M9 12h6'],
  dispatch:   'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12',
  returns:    'M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3',
  cabinets:   ['M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z'],
  explorer:   ['M3.75 6.75A2.25 2.25 0 016 4.5h4.5l1.5 2.25H18a2.25 2.25 0 012.25 2.25v2.25H3.75V6.75z', 'M3.75 11.25h16.5v6A2.25 2.25 0 0118 19.5H6a2.25 2.25 0 01-2.25-2.25v-6z'],
  tools:      ['M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z'],
  workflows:  ['M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z', 'M13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z', 'M3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25z', 'M13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z'],
  reports:    ['M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z', 'M9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625z', 'M16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z'],
  users:      ['M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z'],
  audit:      ['M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z'],
  menu:       'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
  close:      'M6 18L18 6M6 6l12 12',
  chevronRight: 'M8.25 4.5l7.5 7.5-7.5 7.5',
  signOut:    ['M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75'],
};

// ── Nav items config ───────────────────────────────────────────────────────────

interface NavItem { path: string; label: string; iconKey: keyof typeof ICONS; badge?: number }

const NAV_CORE_ALL: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard',      iconKey: 'dashboard' },
  { path: '/inventory', label: 'File Inventory',  iconKey: 'inventory' },
];
const NAV_CORE_REGISTRY: NavItem[] = [
  { path: '/dispatch',  label: 'Dispatch',         iconKey: 'dispatch'  },
  { path: '/returns',   label: 'Returns',           iconKey: 'returns'   },
];
const NAV_REQUESTS: NavItem[] = [
  { path: '/my-requests', label: 'My Requests',   iconKey: 'inventory' },
];

const NAV_DMS_ALL: NavItem[] = [
  { path: '/explorer',  label: 'File Explorer',    iconKey: 'explorer'  },
  { path: '/tools',     label: 'PDF Tools',        iconKey: 'tools'     },
  { path: '/cabinets',  label: 'Documents',        iconKey: 'cabinets'  },
  { path: '/workflows', label: 'Workflows',          iconKey: 'workflows' },
];
const NAV_DMS_REPORTS: NavItem[] = [
  { path: '/reports',   label: 'Reports',           iconKey: 'reports'   },
];

const NAV_ADMIN: NavItem[] = [
  { path: '/users', label: 'Users',     iconKey: 'users' },
  { path: '/audit', label: 'Audit Log', iconKey: 'audit' },
];

// ── NavLink ───────────────────────────────────────────────────────────────────

function NavLink({ item, compact = false }: { item: NavItem; compact?: boolean }) {
  const location = useLocation();
  const active = location.pathname.startsWith(item.path);
  return (
    <Link
      to={item.path}
      title={compact ? item.label : undefined}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative ${
        active
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <Icon d={ICONS[item.iconKey]} className="w-[18px] h-[18px] shrink-0" />
      {!compact && <span className="flex-1 truncate">{item.label}</span>}
      {!compact && item.badge != null && item.badge > 0 && (
        <span className="bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
          {item.badge}
        </span>
      )}
      {active && <span className="absolute inset-y-0 right-0 w-0.5 bg-indigo-400 rounded-l-full" />}
    </Link>
  );
}

// ── NavSection ────────────────────────────────────────────────────────────────

function NavSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500 select-none">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

// ── Logo ──────────────────────────────────────────────────────────────────────

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${compact ? 'justify-center' : ''}`}>
      <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-indigo-900/40">
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className="text-sm font-bold text-white tracking-wide">FileTracks</p>
          <p className="text-[10px] text-slate-500 font-medium">Document Management</p>
        </div>
      )}
    </div>
  );
}

// ── Main Layout ───────────────────────────────────────────────────────────────

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  // Global search shortcut: Ctrl/⌘ + K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  if (!user) return <Navigate to="/login" replace />;

  const isAdmin = user.role === 'ADMIN';
  const isDeptUser = user.role === 'DEPT_USER';
  const isDevBypass = user.id === 'dev-admin-001';
  const initials = user.email.slice(0, 2).toUpperCase();

  const NAV_CORE = isDeptUser
    ? [...NAV_CORE_ALL, ...NAV_REQUESTS]
    : [...NAV_CORE_ALL, ...NAV_CORE_REGISTRY];

  const NAV_DMS = isDeptUser
    ? NAV_DMS_ALL
    : [...NAV_DMS_ALL, ...NAV_DMS_REPORTS];

  const currentLabel = [...NAV_CORE, ...NAV_DMS, ...NAV_ADMIN]
    .find(n => location.pathname.startsWith(n.path))?.label ?? 'FileTracks';

  const SidebarContent = ({ compact = false }: { compact?: boolean }) => (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Logo */}
      <div className={`flex items-center justify-between ${compact ? 'px-3 py-4 justify-center' : 'px-4 py-4'} border-b border-slate-800`}>
        <Logo compact={compact} />
        <button
          onClick={() => setSidebarOpen(false)}
          className="md:hidden text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
        >
          <Icon d={ICONS.close} className="w-4 h-4" />
        </button>
      </div>

      {/* Global search trigger */}
      <div className={compact ? 'px-2 pt-3' : 'px-3 pt-3'}>
        <button
          onClick={() => setSearchOpen(true)}
          title="Search (Ctrl/⌘ K)"
          className={compact
            ? 'w-full flex items-center justify-center py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors'
            : 'w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-white text-sm transition-colors'}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.05a7.25 7.25 0 11-14.5 0 7.25 7.25 0 0114.5 0z" />
          </svg>
          {!compact && (
            <>
              <span className="flex-1 text-left">Search…</span>
              <kbd className="text-[10px] font-medium text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">⌘K</kbd>
            </>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className={`flex-1 overflow-y-auto ${compact ? 'px-2 py-4 space-y-1' : 'px-3 py-4 space-y-5'}`}>
        {compact ? (
          <>
            {[...NAV_CORE, ...NAV_DMS].map(item => <NavLink key={item.path} item={item} compact />)}
            {isAdmin && <div className="border-t border-slate-800 my-2 pt-2 space-y-1">{NAV_ADMIN.map(item => <NavLink key={item.path} item={item} compact />)}</div>}
          </>
        ) : (
          <>
            <NavSection label="Core">
              {NAV_CORE.map(item => <NavLink key={item.path} item={item} />)}
            </NavSection>
            <NavSection label="Document Management">
              {NAV_DMS.map(item => <NavLink key={item.path} item={item} />)}
            </NavSection>
            {isAdmin && (
              <NavSection label="Administration">
                {NAV_ADMIN.map(item => <NavLink key={item.path} item={item} />)}
              </NavSection>
            )}
          </>
        )}
      </nav>

      {/* User profile */}
      {!compact && (
        <div className="shrink-0 border-t border-slate-800 px-4 py-4">
          {isDevBypass && (
            <div className="mb-3 px-2.5 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p className="text-xs font-semibold text-amber-400">Dev Preview Mode</p>
              <p className="text-[10px] text-amber-500/70 mt-0.5">Live data unavailable</p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-md">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{user.email}</p>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5">{user.role.replace('_', ' ')}</p>
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <button
                onClick={logout}
                title="Sign out"
                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Icon d={ICONS.signOut} className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {compact && (
        <div className="shrink-0 border-t border-slate-800 px-2 py-3 flex flex-col items-center gap-2">
          <NotificationBell />
          <button
            onClick={logout}
            title="Sign out"
            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Icon d={ICONS.signOut} className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-white border-b border-gray-200 flex items-center gap-3 px-4 h-14 shrink-0 shadow-sm">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-gray-500 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100"
        >
          <Icon d={ICONS.menu} className="w-5 h-5" />
        </button>
        <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-gray-800">{currentLabel}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setSearchOpen(true)}
            title="Search"
            className="p-1.5 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.05a7.25 7.25 0 11-14.5 0 7.25 7.25 0 0114.5 0z" />
            </svg>
          </button>
          <NotificationBell />
        </div>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Desktop sidebar — full width */}
      <aside className={`
        hidden md:flex flex-col shrink-0
        w-60 border-r border-slate-800
        transform transition-none
      `}>
        <SidebarContent />
      </aside>

      {/* Mobile sidebar — slide-in */}
      <aside className={`
        md:hidden fixed inset-y-0 left-0 z-50 w-64 flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <SidebarContent />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pt-14 md:pt-0 bg-gray-50">
        {children}
      </main>

      {/* Global search palette */}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

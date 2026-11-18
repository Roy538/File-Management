import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Archive, ArrowLeftRight, BarChart3, Bell, Building2, ClipboardCheck, FileQuestion, FileSearch, FolderOpen, Gavel, Library,
  Search, Tags, Upload, Users, Workflow,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import type { DueDocument, TaskView } from '@/lib/api/types';
import { useCan, useSession } from '@/features/auth/session';
import { TabbedPanel } from '@/components/ui/TabbedPanel';
import { useUploadDialog } from '@/features/explorer/uploadStore';
import type { Dashboard } from '@/features/records/types';

/**
 * Home: the reference "launcher" — grouped panels of what this user can do, each with a live
 * figure from the API where one exists. Nothing is shown that the user cannot actually use.
 */
export function LauncherPage() {
  const user = useSession((s) => s.user);
  const can = {
    explore: useCan('cabinets:read'),
    search: useCan('documents:read'),
    upload: useCan('documents:upload'),
    review: useCan('workflows:participate'),
    designWorkflows: useCan('workflows:manage'),
    users: useCan('users:read'),
    types: useCan('document_types:manage'),
    retention: useCan('retention:manage'),
    holds: useCan('legal_holds:manage'),
    records: useCan('records:read'),
    requestFiles: useCan('records:request'),
    dispatch: useCan('records:dispatch'),
    reports: useCan('reports:read'),
    departments: useCan('settings:manage'),
  };
  const openUpload = useUploadDialog((s) => s.show);

  const tasks = useQuery({ queryKey: ['tasks'], queryFn: () => api.get<TaskView[]>('/tasks'), enabled: can.review });
  const unread = useQuery({ queryKey: ['notifications', 'unread-count'], queryFn: () => api.get<{ unread: number }>('/notifications/unread-count') });
  const due = useQuery({
    queryKey: ['retention', 'due', 30],
    queryFn: () => api.get<DueDocument[]>('/retention/due', { withinDays: 30 }),
    enabled: can.retention,
  });

  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard'), enabled: can.records });
  const reg = dashboard.data?.records;
  const openTasks = tasks.data?.length;
  const overdue = tasks.data?.filter((t) => t.overdue).length ?? 0;
  const firstName = user?.fullName.split(' ')[0] ?? '';

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <h1 className="doc-title text-[30px] leading-tight text-ink">Good to see you, {firstName}</h1>
        <p className="mt-1 text-[14px] text-muted">{user?.organisation.name}</p>
      </header>

      <div className="grid gap-x-6 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
        {(can.explore || can.search) && (
          <TabbedPanel tab="Locating" icon={<FileSearch className="size-4" />}>
            <ul className="divide-y divide-rule">
              {can.explore && <Tile to="/explorer" icon={<FolderOpen />} title="File explorer" text="Browse cabinets, folders and sub-dividers" />}
              {can.search && <Tile to="/search" icon={<Search />} title="Content search" text="Find documents by words inside them" />}
            </ul>
          </TabbedPanel>
        )}

        {(can.upload || can.review) && (
          <TabbedPanel tab="Filing and review" icon={<ClipboardCheck className="size-4" />}>
            <ul className="divide-y divide-rule">
              {can.upload && <Tile onClick={() => openUpload()} icon={<Upload />} title="Upload a document" text="File it into a folder; it’s scanned before anyone can open it" />}
              {can.review && (
                <Tile to="/tasks" icon={<ClipboardCheck />} title="My reviews"
                  text={overdue ? `${overdue} overdue` : 'Documents waiting for your decision'}
                  figure={openTasks} urgent={overdue > 0} loading={tasks.isLoading} />
              )}
              <Tile to="/notifications" icon={<Bell />} title="Notifications" text="Assignments, decisions and escalations"
                figure={unread.data?.unread} loading={unread.isLoading} />
            </ul>
          </TabbedPanel>
        )}

        {can.records && (
          <TabbedPanel tab="Registry" icon={<Library className="size-4" />}>
            <ul className="divide-y divide-rule">
              <Tile to="/records" icon={<Library />} title="File register"
                text={reg ? (reg.byStatus.MISSING ? `${reg.byStatus.MISSING} missing` : `${reg.byStatus.AVAILABLE} in the registry`) : 'Find a paper file and where it is'}
                figure={reg?.totalFiles} urgent={(reg?.byStatus.MISSING ?? 0) > 0} loading={dashboard.isLoading} />
              <Tile to={reg?.overdue ? '/records/loans?overdue=1' : '/records/loans'} icon={<ArrowLeftRight />} title="Files on loan"
                text={reg ? (reg.overdue ? `${reg.overdue} late` : `${reg.dispatchedToday} lent and ${reg.returnedToday} returned today`) : 'Who has which file'}
                figure={reg?.outOnLoan} urgent={(reg?.overdue ?? 0) > 0} loading={dashboard.isLoading} />
              {can.requestFiles && (
                <Tile to="/records/requests" icon={<FileQuestion />} title={can.dispatch ? 'File requests' : 'My file requests'}
                  text={can.dispatch ? 'Waiting for your decision' : 'Your requests still waiting'} figure={reg?.pendingRequests} loading={dashboard.isLoading} />
              )}
              {can.reports && <Tile to="/reports" icon={<BarChart3 />} title="Reports" text="Loans, returns, missing files; Excel and PDF" />}
            </ul>
          </TabbedPanel>
        )}

        {(can.users || can.types || can.designWorkflows || can.retention || can.holds) && (
          <TabbedPanel tab="Administration" icon={<Users className="size-4" />}>
            <ul className="divide-y divide-rule">
              {can.users && <Tile to="/admin/users" icon={<Users />} title="Users" text="Accounts, roles and permissions" />}
              {can.departments && <Tile to="/admin/departments" icon={<Building2 />} title="Departments" text="Who owns each paper file" />}
              {can.types && <Tile to="/admin/document-types" icon={<Tags />} title="Document types" text="Types and the details each one records" />}
              {can.designWorkflows && <Tile to="/admin/workflows" icon={<Workflow />} title="Workflow designs" text="Review and approval steps" />}
              {can.retention && (
                <Tile to="/admin/retention" icon={<Archive />} title="Retention" text="Documents due for archive or disposal in 30 days"
                  figure={due.data?.length} loading={due.isLoading} />
              )}
              {can.holds && <Tile to="/admin/legal-holds" icon={<Gavel />} title="Legal holds" text="Preserve documents for litigation or audit" />}
            </ul>
          </TabbedPanel>
        )}
      </div>
    </div>
  );
}

function Tile({ to, onClick, icon, title, text, figure, urgent, loading }: {
  to?: string; onClick?: () => void; icon: ReactNode; title: string; text: string;
  figure?: number | undefined; urgent?: boolean; loading?: boolean;
}) {
  const body = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-navy-50 text-navy-800 [&>svg]:size-5" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-ink group-hover:text-navy-800">{title}</span>
        <span className={urgent ? 'block text-[13px] text-danger' : 'block text-[13px] text-muted'}>{text}</span>
      </span>
      {loading ? <span className="h-5 w-6 animate-pulse rounded bg-navy-100" aria-hidden /> :
        figure !== undefined ? <span className="doc-title text-2xl tabular-nums text-navy-800">{figure}</span> : null}
    </>
  );
  const cls = 'group flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-navy-50/60';
  return <li>{to ? <Link to={to} className={cls}>{body}</Link> : <button className={cls} onClick={onClick}>{body}</button>}</li>;
}

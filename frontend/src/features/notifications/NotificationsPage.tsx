import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, CheckCircle2, ClipboardCheck, PencilLine, UserRoundCheck, XCircle } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { NotificationView, Paged } from '@/lib/api/types';
import { formatRelative } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/lib/cn';

const PAGE_SIZE = 20;

const ICONS: Record<string, ReactNode> = {
  WORKFLOW_TASK_ASSIGNED: <ClipboardCheck className="size-4 text-navy-800" />,
  WORKFLOW_APPROVED: <CheckCircle2 className="size-4 text-ok" />,
  WORKFLOW_REJECTED: <XCircle className="size-4 text-danger" />,
  WORKFLOW_CHANGES_REQUESTED: <PencilLine className="size-4 text-warn" />,
  WORKFLOW_TASK_ESCALATED: <AlertTriangle className="size-4 text-danger" />,
  WORKFLOW_TASK_DELEGATED: <UserRoundCheck className="size-4 text-navy-800" />,
};

export function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);

  const list = useQuery({
    queryKey: ['notifications', 'list', unreadOnly, page],
    queryFn: () => api.get<Paged<NotificationView>>('/notifications', { unreadOnly, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const markRead = useMutation({ mutationFn: (id: string) => api.post(`/notifications/${id}/read`), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: refresh });

  const open = (n: NotificationView) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.resourceType === 'DOCUMENT' && n.resourceId) navigate(`/documents/${n.resourceId}`);
  };

  const items = list.data?.content ?? [];
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const groups = [
    { label: 'Today', items: items.filter((n) => new Date(n.createdAt).getTime() >= startOfToday) },
    { label: 'Earlier', items: items.filter((n) => new Date(n.createdAt).getTime() < startOfToday) },
  ].filter((g) => g.items.length);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" crumbs={[{ label: 'Home', to: '/' }, { label: 'Notifications' }]}
        actions={<>
          <label className="flex items-center gap-2 text-[13.5px] text-ink">
            <input type="checkbox" className="accent-navy-800" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(0); }} />
            Unread only
          </label>
          <Button size="sm" loading={markAll.isPending} onClick={() => markAll.mutate()}>Mark all as read</Button>
        </>} />

      <div className="rounded-lg border border-rule bg-surface">
        {list.isLoading ? <SkeletonRows rows={6} cols={2} />
          : list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          : !items.length ? (
            <EmptyState icon={<Bell className="size-8" />} title={unreadOnly ? 'You’re all caught up' : 'No notifications yet'}>
              Review assignments, decisions and escalations will appear here.
            </EmptyState>
          ) : (
            <>
              {groups.map((g) => (
                <section key={g.label} aria-label={g.label}>
                  <h2 className="border-b border-rule bg-paper px-4 py-1.5 text-[12.5px] font-medium text-muted">{g.label}</h2>
                  <ul className="divide-y divide-rule">
                    {g.items.map((n) => (
                      <li key={n.id}>
                        <button onClick={() => open(n)}
                          className={cn('flex w-full gap-3 border-l-[3px] px-4 py-3 text-left hover:bg-navy-50/60',
                            n.readAt ? 'border-l-transparent' : 'border-l-manila-300 bg-manila-100/30')}>
                          <span className="mt-0.5" aria-hidden>{ICONS[n.type] ?? <Bell className="size-4 text-muted" />}</span>
                          <span className="min-w-0 flex-1">
                            <span className={cn('block text-[14px]', n.readAt ? 'text-ink' : 'font-semibold text-ink')}>
                              {n.title}{n.readAt ? null : <span className="sr-only"> (unread)</span>}
                            </span>
                            {n.body ? <span className="block text-[13px] text-muted">{n.body}</span> : null}
                          </span>
                          <time dateTime={n.createdAt} className="shrink-0 text-[12.5px] text-muted">{formatRelative(n.createdAt)}</time>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <Pagination page={page} size={PAGE_SIZE} totalElements={list.data!.totalElements}
                totalPages={list.data!.totalPages} onPage={setPage} />
            </>
          )}
      </div>
    </div>
  );
}

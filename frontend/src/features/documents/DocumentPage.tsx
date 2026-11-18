import { useState, type ReactNode } from 'react';
import { usePeople } from '@/lib/usePeople';
import { useNavigate, useParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, Download, FileUp, Gavel, Lock, LockOpen, MoreHorizontal, Send, Stamp, Trash2, Eye } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import type { DocumentDetail } from '@/lib/api/types';
import { useCan } from '@/features/auth/session';
import { useCabinetTree } from '@/features/explorer/queries';
import { PageHeader, type Crumb } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { StatusBadge, ProcessingLabel } from '@/components/ui/StatusBadge';
import { ErrorState, Spinner } from '@/components/ui/States';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FileIcon } from '@/components/ui/FileIcon';
import { formatBytes, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { downloadVersion, useDocument, useRefreshDocument } from './documentApi';
import { NewVersionDialog, SubmitReviewDialog } from './DocumentDialogs';
import { DetailsPanel, PreviewPanel, ProcessingPanel, ReviewsPanel, VersionsPanel } from './DocumentPanels';

const TABS = ['Preview', 'Details', 'Versions', 'Reviews', 'Processing'] as const;
type Tab = (typeof TABS)[number];

export function DocumentPage() {
  const { id = '' } = useParams();
  const doc = useDocument(id);

  if (doc.isLoading) return <div className="grid h-64 place-items-center"><Spinner label="Opening document" /></div>;
  if (doc.isError || !doc.data) return <ErrorState error={doc.error} onRetry={() => doc.refetch()} />;
  return <DocumentView doc={doc.data} />;
}

function DocumentView({ doc }: { doc: DocumentDetail }) {
  const nameOf = usePeople([doc.lock?.lockedBy]);
  const [tab, setTab] = useState<Tab>('Preview');
  const [dialog, setDialog] = useState<'version' | 'review' | 'delete' | 'publish' | null>(null);
  const refresh = useRefreshDocument(doc.id);
  const navigate = useNavigate();
  const canReview = useCan('workflows:participate');
  const canOverrideLock = useCan('documents:lock_override');
  const tree = useCabinetTree(doc.cabinetId);

  const current = doc.versions.find((v) => v.versionNo === doc.currentVersionNo);
  const ready = current?.processingStatus === 'AVAILABLE';
  const can = (r: DocumentDetail['rights'][number]) => doc.rights.includes(r);
  const frozen = doc.status === 'ARCHIVED' || doc.status === 'UNDER_REVIEW';
  const lockedByOther = doc.lock !== null && !doc.lock.byYou;
  const canEdit = can('edit') && !frozen && !lockedByOther;

  const lockMutation = useMutation({
    mutationFn: (op: 'checkout' | 'release') => api.post<DocumentDetail>(`/documents/${doc.id}/${op}`),
    onSuccess: async (_d, op) => {
      await refresh();
      toast.success(op === 'checkout' ? 'Checked out' : lockedByOther ? 'Lock released' : 'Checked in');
    },
  });

  const folder = tree.data?.folders.find((f) => f.id === doc.folderId);
  const crumbs: Crumb[] = [{ label: 'File explorer', to: '/explorer' }];
  if (tree.data) {
    crumbs.push({ label: tree.data.cabinet.name, to: `/explorer?cabinet=${doc.cabinetId}` });
    if (folder) crumbs.push({ label: folder.name, to: `/explorer?cabinet=${doc.cabinetId}&folder=${doc.folderId}` });
  }

  const menuItems: ReactNode[] = [];
  if (canReview && can('edit') && !frozen && doc.status !== 'APPROVED') {
    menuItems.push(<MenuItem key="review" icon={<Send className="size-4" />} onSelect={() => setDialog('review')}>Submit for review</MenuItem>);
  }
  if (can('edit') && doc.status === 'APPROVED') {
    menuItems.push(<MenuItem key="publish" icon={<Stamp className="size-4" />} onSelect={() => setDialog('publish')}>Publish</MenuItem>);
  }
  if (can('delete')) {
    if (menuItems.length) menuItems.push(<MenuSeparator key="sep" />);
    menuItems.push(
      <MenuItem key="delete" danger icon={<Trash2 className="size-4" />} disabled={doc.onLegalHold || frozen} onSelect={() => setDialog('delete')}>
        {doc.onLegalHold ? 'Delete (on legal hold)' : 'Delete'}
      </MenuItem>,
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={crumbs}
        title={<span className="flex items-center gap-2.5"><FileIcon contentType={current?.contentType} className="size-6" />{doc.title}</span>}
        actions={
          <>
            {can('download') ? (
              <Button icon={<Download className="size-4" />} disabled={!ready} onClick={() => downloadVersion(doc.id)}
                title={ready ? undefined : 'Available once the virus scan finishes'}>
                Download
              </Button>
            ) : null}
            {doc.lock?.byYou ? (
              <Button icon={<LockOpen className="size-4" />} loading={lockMutation.isPending} onClick={() => lockMutation.mutate('release')}>Check in</Button>
            ) : lockedByOther && canOverrideLock && can('manage') ? (
              <Button icon={<LockOpen className="size-4" />} loading={lockMutation.isPending} onClick={() => lockMutation.mutate('release')}>Release lock</Button>
            ) : canEdit ? (
              <Button icon={<Lock className="size-4" />} loading={lockMutation.isPending} onClick={() => lockMutation.mutate('checkout')}>Check out</Button>
            ) : null}
            {canEdit ? <Button variant="primary" icon={<FileUp className="size-4" />} onClick={() => setDialog('version')}>Upload new version</Button> : null}
            {menuItems.length ? (
              <Menu>
                <MenuTrigger asChild><Button aria-label="More actions" icon={<MoreHorizontal className="size-4" />} /></MenuTrigger>
                <MenuContent>{menuItems}</MenuContent>
              </Menu>
            ) : null}
          </>
        }
      >
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          <StatusBadge status={doc.status} />
          <span>Version {doc.currentVersionNo}</span>
          {current ? <span>{current.fileName}, {formatBytes(current.sizeBytes)}</span> : null}
          <span>Updated {formatDateTime(doc.updatedAt)}</span>
          {current && !ready ? <ProcessingLabel status={current.processingStatus} /> : null}
        </p>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-2">
        {doc.onLegalHold ? <Banner tone="danger" icon={<Gavel className="size-4" />}>This document is under a legal hold. It can’t be deleted or disposed of until the hold is released.</Banner> : null}
        {doc.status === 'ARCHIVED' ? <Banner tone="manila" icon={<Archive className="size-4" />}>Archived {formatDateTime(doc.archivedAt)} under a retention policy. It can be read and downloaded but no longer changed.</Banner> : null}
        {doc.status === 'UNDER_REVIEW' ? <Banner tone="warn" icon={<Eye className="size-4" />}>Under review. It can’t be changed until the review ends; see the Reviews tab.</Banner> : null}
        {doc.lock ? (
          <Banner tone="info" icon={<Lock className="size-4" />}>
            {doc.lock.byYou
              ? `You have this document checked out until ${formatDateTime(doc.lock.expiresAt)}. Others can’t change it meanwhile.`
              : `Checked out by ${nameOf(doc.lock.lockedBy) ?? 'another user'} until ${formatDateTime(doc.lock.expiresAt)}. You can read it but not change it.`}
          </Banner>
        ) : null}
      </div>

      <div className="rounded-lg border border-rule bg-surface">
        <div role="tablist" aria-label="Document sections" className="flex overflow-x-auto border-b border-rule px-2">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`panel-${t}`}
              onClick={() => setTab(t)}
              className={cn('-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13.5px]',
                tab === t ? 'border-navy-800 font-medium text-navy-800' : 'border-transparent text-muted hover:text-ink')}
            >
              {t}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'Preview' ? <PreviewPanel doc={doc} /> : null}
          {tab === 'Details' ? <DetailsPanel doc={doc} onSaved={refresh} /> : null}
          {tab === 'Versions' ? <VersionsPanel doc={doc} onChanged={refresh} /> : null}
          {tab === 'Reviews' ? <ReviewsPanel doc={doc} onChanged={refresh} /> : null}
          {tab === 'Processing' ? <ProcessingPanel doc={doc} /> : null}
        </div>
      </div>

      <NewVersionDialog open={dialog === 'version'} onOpenChange={(o) => setDialog(o ? 'version' : null)} doc={doc} onDone={refresh} />
      <SubmitReviewDialog open={dialog === 'review'} onOpenChange={(o) => setDialog(o ? 'review' : null)} doc={doc}
        onDone={async () => { await refresh(); setTab('Reviews'); }} />
      <ConfirmDialog
        open={dialog === 'publish'}
        onOpenChange={(o) => setDialog(o ? 'publish' : null)}
        title="Publish document"
        confirmLabel="Publish"
        onConfirm={async () => {
          await api.post(`/documents/${doc.id}/publish`);
          await refresh();
          toast.success('Published');
        }}
      >
        Mark this approved document as published, the version everyone should use.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(o) => setDialog(o ? 'delete' : null)}
        title="Delete document"
        confirmLabel="Delete document"
        danger
        onConfirm={async () => {
          try {
            await api.delete(`/documents/${doc.id}`);
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : 'The document could not be deleted.');
            throw e;
          }
          await refresh();
          toast.success('Document deleted');
          navigate(`/explorer?cabinet=${doc.cabinetId}&folder=${doc.folderId}`);
        }}
      >
        Delete <strong>{doc.title}</strong>? It disappears from the folder and search. Its versions are kept for retention and audit.
      </ConfirmDialog>
    </div>
  );
}

function Banner({ tone, icon, children }: { tone: 'danger' | 'warn' | 'info' | 'manila'; icon: ReactNode; children: ReactNode }) {
  const tones = {
    danger: 'border-danger/25 bg-danger-bg text-danger',
    warn: 'border-warn/25 bg-warn-bg text-warn',
    info: 'border-info/25 bg-info-bg text-info',
    manila: 'border-manila-300 bg-manila-100 text-manila-700',
  };
  return <p role="status" className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]', tones[tone])}><span className="mt-0.5">{icon}</span>{children}</p>;
}

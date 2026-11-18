import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api/client';
import type { DocumentDetail, DownloadLink } from '@/lib/api/types';
import { keys } from '@/features/explorer/queries';

/** The document, re-polled every 3 s while its current version is still being scanned. */
export function useDocument(id: string) {
  return useQuery({
    queryKey: keys.document(id),
    queryFn: () => api.get<DocumentDetail>(`/documents/${id}`),
    refetchInterval: (q) => {
      const d = q.state.data;
      const current = d?.versions.find((v) => v.versionNo === d.currentVersionNo);
      return current && (current.processingStatus === 'STORED' || current.processingStatus === 'PROCESSING') ? 3000 : false;
    },
  });
}

/** Refreshes everything that shows this document after a change. */
export function useRefreshDocument(id: string) {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: keys.document(id) }),
    qc.invalidateQueries({ queryKey: keys.documents }),
  ]);
}

/** Plain-language reasons the server refuses to hand out a file. */
export function explainContentError(e: unknown): string {
  if (!(e instanceof ApiError)) return 'The file could not be opened. Try again.';
  switch (e.code) {
    case 'PROCESSING': return 'This version is still being virus-scanned. It will open in a moment.';
    case 'QUARANTINED': return 'This version failed the virus scan and is blocked. Ask an administrator to investigate.';
    case 'PROCESSING_FAILED': return 'This version could not be scanned, so it is blocked for now. An administrator can reprocess it.';
    default: return e.message;
  }
}

/** Downloads a version via a short-lived link (the server checks access and records the download). */
export async function downloadVersion(documentId: string, versionNo?: number) {
  try {
    const link = await api.get<DownloadLink>(`/documents/${documentId}/content-url`, { version: versionNo });
    window.location.assign(link.url);
  } catch (e) {
    toast.error(explainContentError(e));
  }
}

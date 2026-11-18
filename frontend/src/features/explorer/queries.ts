import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { CabinetTree, CabinetView, DocumentTypeView, FolderNode, Visibility } from '@/lib/api/types';

/** Query keys shared by the explorer, upload dialog and document page. */
export const keys = {
  cabinets: (scope?: Visibility | null) => ['cabinets', scope ?? 'ALL'] as const,
  cabinet: (id: string) => ['cabinet', id] as const,
  documents: ['documents'] as const,
  document: (id: string) => ['document', id] as const,
  documentTypes: ['document-types'] as const,
};

export const useCabinets = (scope?: Visibility | null) =>
  useQuery({ queryKey: keys.cabinets(scope), queryFn: () => api.get<CabinetView[]>('/cabinets', { scope: scope ?? undefined }) });

export const useCabinetTree = (id: string | null | undefined) =>
  useQuery({ queryKey: keys.cabinet(id ?? ''), queryFn: () => api.get<CabinetTree>(`/cabinets/${id}`), enabled: !!id });

export const useDocumentTypes = (enabled = true) =>
  useQuery({ queryKey: keys.documentTypes, queryFn: () => api.get<DocumentTypeView[]>('/document-types'), enabled, staleTime: 5 * 60_000 });

/** Folders in tree order (parents before children) with their depth, for selects and trees. */
export function orderFolders(folders: FolderNode[]): FolderNode[] {
  const byParent = new Map<string | null, FolderNode[]>();
  for (const f of folders) {
    const list = byParent.get(f.parentId) ?? [];
    list.push(f);
    byParent.set(f.parentId, list);
  }
  const out: FolderNode[] = [];
  const walk = (parent: string | null) => {
    for (const f of byParent.get(parent) ?? []) {
      out.push(f);
      walk(f.id);
    }
  };
  walk(null);
  return out;
}

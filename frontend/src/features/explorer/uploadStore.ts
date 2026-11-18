import { create } from 'zustand';

/** The upload dialog is global (top bar, sidebar tile, explorer); this holds whether it is open and where to file. */
interface UploadDialogState {
  open: boolean;
  folderId: string | null;
  subDividerId: string | null;
  show: (target?: { folderId?: string | null; subDividerId?: string | null }) => void;
  hide: () => void;
}

export const useUploadDialog = create<UploadDialogState>((set) => ({
  open: false,
  folderId: null,
  subDividerId: null,
  show: (target) => set({ open: true, folderId: target?.folderId ?? null, subDividerId: target?.subDividerId ?? null }),
  hide: () => set({ open: false }),
}));

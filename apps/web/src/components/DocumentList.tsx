import { useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiUpload } from '../lib/api-client';
import { useAuth } from '../lib/auth';
import { DocumentStatusBadge, ALLOWED_DOC_TRANSITIONS } from './DocumentStatusBadge';
import { ConfirmDialog } from './ConfirmDialog';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocVersion {
  id: string;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

interface DocItem {
  id: string;
  title: string;
  status: string;
  checkedOutBy: { id: string; firstName: string; lastName: string } | null;
  documentType: { id: string; name: string } | null;
  ocrText: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { versions: number };
}

interface DocDetail extends DocItem {
  versions: DocVersion[];
}

interface DocumentType { id: string; name: string }

interface Props {
  folderId?: string;
  subDividerId?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function FileTypeIcon({ mimeType, className = 'w-8 h-8' }: { mimeType?: string; className?: string }) {
  const isImage = mimeType?.startsWith('image/');
  const isPdf   = mimeType === 'application/pdf';
  const isWord  = mimeType?.includes('word') || mimeType?.includes('document');
  const isExcel = mimeType?.includes('sheet') || mimeType?.includes('excel');

  if (isPdf) return (
    <svg className={`${className} text-red-500`} viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM9.5 17.5c-.28 0-.5-.22-.5-.5v-5c0-.28.22-.5.5-.5h1c1.1 0 2 .9 2 2s-.9 2-2 2H10v1.5c0 .28-.22.5-.5.5zm4.5-2.5c0 1.1-.9 2-2 2v-4c1.1 0 2 .9 2 2zm2.5 2c0 .28-.22.5-.5.5S15.5 19.28 15.5 19V14h-1c-.28 0-.5-.22-.5-.5s.22-.5.5-.5h3c.28 0 .5.22.5.5s-.22.5-.5.5h-1v5z"/>
    </svg>
  );
  if (isImage) return (
    <svg className={`${className} text-purple-500`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
  if (isWord) return (
    <svg className={`${className} text-blue-600`} viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
    </svg>
  );
  if (isExcel) return (
    <svg className={`${className} text-green-600`} viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
    </svg>
  );
  return (
    <svg className={`${className} text-slate-400`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

// ── Drop Zone ─────────────────────────────────────────────────────────────────

function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  }, [onFiles]);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
        dragging
          ? 'border-indigo-400 bg-indigo-50'
          : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30'
      }`}
    >
      <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
        dragging ? 'bg-indigo-100' : 'bg-gray-100'
      }`}>
        <svg className={`w-6 h-6 transition-colors ${dragging ? 'text-indigo-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-gray-700">Drop files here or <span className="text-indigo-600">browse</span></p>
        <p className="text-xs text-gray-400 mt-0.5">PDF, Word, Excel, images and more</p>
      </div>
      <input ref={inputRef} type="file" multiple className="hidden" onChange={e => {
        const files = Array.from(e.target.files ?? []);
        if (files.length) onFiles(files);
        e.target.value = '';
      }} />
    </div>
  );
}

// ── Upload Form ───────────────────────────────────────────────────────────────

interface UploadFormProps {
  folderId?: string;
  subDividerId?: string;
  docTypes: DocumentType[];
  initialFile?: File;
  onDone: () => void;
  queryKey: unknown[];
}

function UploadForm({ folderId, subDividerId, docTypes, initialFile, onDone, queryKey }: UploadFormProps) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [title, setTitle] = useState(initialFile?.name ?? '');
  const [docTypeId, setDocTypeId] = useState('');
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title || file.name);
      if (folderId) fd.append('folderId', folderId);
      if (subDividerId) fd.append('subDividerId', subDividerId);
      if (docTypeId) fd.append('documentTypeId', docTypeId);
      await apiUpload('/api/documents', fd);
      qc.invalidateQueries({ queryKey });
      onDone();
      toast.success('Document uploaded');
    } catch {
      toast.error('Upload failed — please try again');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {file ? (
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <FileTypeIcon mimeType={file.type} className="w-8 h-8 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900 truncate">{file.name}</p>
            <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => { setFile(null); setTitle(''); }}
            className="text-gray-300 hover:text-gray-500"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 p-3 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 text-sm text-gray-500"
        >
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          Click to select a file
          <input ref={fileInputRef} type="file" className="hidden" onChange={e => {
            const f = e.target.files?.[0];
            if (f) { setFile(f); if (!title) setTitle(f.name); }
          }} />
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Document Title</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Document title"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      {docTypes.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Document Type</label>
          <select
            value={docTypeId}
            onChange={e => setDocTypeId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">— none —</option>
            {docTypes.map(dt => <option key={dt.id} value={dt.id}>{dt.name}</option>)}
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="flex-1 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!file || uploading}
          className="flex-1 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg"
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </form>
  );
}

// ── Gallery Card ──────────────────────────────────────────────────────────────

function DocCard({
  doc, onExpand, onDelete, onChangeStatus, canEdit, isAdmin, expanded, expandedDoc,
}: {
  doc: DocItem; onExpand: () => void; onDelete: () => void;
  onChangeStatus: (status: string) => void;
  canEdit: boolean; isAdmin: boolean;
  expanded: boolean; expandedDoc: DocDetail | null;
}) {
  const latestVersion = expandedDoc?.versions[0];
  const isCheckedOut = doc.status === 'CHECKED_OUT';
  const isFinalized = doc.status === 'FINALIZED';

  return (
    <div className={`group bg-white border rounded-xl overflow-hidden transition-all duration-150 hover:shadow-md ${
      expanded ? 'border-indigo-200 shadow-md ring-1 ring-indigo-100' : 'border-gray-200'
    }`}>
      {/* Thumbnail area */}
      <div
        className="h-28 bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center cursor-pointer relative"
        onClick={onExpand}
      >
        <FileTypeIcon mimeType={latestVersion?.mimeType} className="w-14 h-14 opacity-60" />
        {isCheckedOut && (
          <div className="absolute top-2 left-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
              Checked out
            </span>
          </div>
        )}
        {isFinalized && (
          <div className="absolute top-2 left-2">
            <span className="text-[10px] font-semibold text-green-700 bg-green-100 border border-green-200 px-1.5 py-0.5 rounded-full">
              Finalized
            </span>
          </div>
        )}
        <Link
          to={`/documents/${doc.id}/view`}
          onClick={e => e.stopPropagation()}
          title="Open viewer"
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white text-indigo-600 hover:text-indigo-800 p-1 rounded-md shadow-sm border border-gray-200"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </Link>
      </div>

      {/* Info row */}
      <div className="px-3 py-2.5 cursor-pointer" onClick={onExpand}>
        <p className="text-xs font-semibold text-gray-900 truncate" title={doc.title}>{doc.title}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-gray-400">
            {doc.documentType?.name ?? 'No type'} · v{doc._count.versions}
          </span>
          <DocumentStatusBadge status={doc.status} />
        </div>
        {doc.checkedOutBy && (
          <p className="text-[10px] text-amber-600 mt-0.5 truncate">
            Out: {doc.checkedOutBy.firstName} {doc.checkedOutBy.lastName}
          </p>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 px-3 py-3 bg-gray-50 space-y-3">
          {canEdit && ALLOWED_DOC_TRANSITIONS[doc.status]?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {ALLOWED_DOC_TRANSITIONS[doc.status].map(next => (
                <button
                  key={next}
                  onClick={() => onChangeStatus(next)}
                  className="px-2 py-1 text-[10px] font-medium border border-gray-300 text-gray-700 rounded-md hover:bg-white hover:border-indigo-300 transition-colors"
                >
                  → {next.replace('_', ' ')}
                </button>
              ))}
            </div>
          )}
          {expandedDoc?.versions && expandedDoc.versions.length > 0 && (
            <VersionList docId={doc.id} versions={expandedDoc.versions} />
          )}
          {doc.ocrText && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">OCR Text</p>
              <p className="text-[10px] text-gray-600 bg-white rounded-lg p-2 border border-gray-100 max-h-16 overflow-y-auto">
                {doc.ocrText}
              </p>
            </div>
          )}
          {isAdmin && (
            <button onClick={onDelete} className="text-[10px] text-red-500 hover:text-red-700 float-right">
              Delete document
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── List Row ──────────────────────────────────────────────────────────────────

function DocRow({
  doc, onExpand, onDelete, onChangeStatus, canEdit, isAdmin, expanded, expandedDoc,
}: {
  doc: DocItem; onExpand: () => void; onDelete: () => void;
  onChangeStatus: (status: string) => void;
  canEdit: boolean; isAdmin: boolean;
  expanded: boolean; expandedDoc: DocDetail | null;
}) {
  const latestVersion = expandedDoc?.versions[0];

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white hover:border-gray-300 transition-colors">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/50"
        onClick={onExpand}
      >
        <FileTypeIcon mimeType={latestVersion?.mimeType} className="w-8 h-8 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {doc.documentType?.name ?? 'No type'} · {doc._count.versions} version{doc._count.versions !== 1 ? 's' : ''}
            {doc.checkedOutBy && (
              <span className="text-amber-600"> · Out: {doc.checkedOutBy.firstName} {doc.checkedOutBy.lastName}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DocumentStatusBadge status={doc.status} />
          <Link
            to={`/documents/${doc.id}/view`}
            onClick={e => e.stopPropagation()}
            title="Open viewer"
            className="text-indigo-500 hover:text-indigo-700 p-1 rounded"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </Link>
          <svg className={`w-4 h-4 text-gray-300 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-3 pt-2.5 bg-gray-50 space-y-3">
          {canEdit && ALLOWED_DOC_TRANSITIONS[doc.status]?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {ALLOWED_DOC_TRANSITIONS[doc.status].map(next => (
                <button
                  key={next}
                  onClick={() => onChangeStatus(next)}
                  className="px-2.5 py-1 text-xs font-medium border border-gray-300 text-gray-700 rounded-md hover:bg-white hover:border-indigo-300 transition-colors"
                >
                  → {next.replace('_', ' ')}
                </button>
              ))}
            </div>
          )}
          {expandedDoc?.versions && expandedDoc.versions.length > 0 && (
            <VersionList docId={doc.id} versions={expandedDoc.versions} />
          )}
          {doc.ocrText && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">OCR Text Preview</p>
              <p className="text-xs text-gray-600 bg-white rounded-lg p-2 border border-gray-100 max-h-20 overflow-y-auto whitespace-pre-wrap">
                {doc.ocrText}
              </p>
            </div>
          )}
          {isAdmin && (
            <div className="flex justify-end pt-1">
              <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700">
                Delete document
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Version List ──────────────────────────────────────────────────────────────

function VersionList({ docId, versions }: { docId: string; versions: DocVersion[] }) {
  async function handleDownload(versionId: string, fileName: string) {
    const { url } = await api.get<{ url: string }>(`/api/documents/${docId}/versions/${versionId}/download`);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-1.5">Version History</p>
      <div className="space-y-1">
        {versions.map(v => (
          <div key={v.id} className="flex items-center justify-between text-xs text-gray-600 bg-white rounded-lg px-3 py-2 border border-gray-100">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-indigo-600 font-bold shrink-0">v{v.versionNumber}</span>
              <span className="truncate text-gray-500">{v.fileName}</span>
              <span className="text-gray-400 shrink-0">({formatBytes(v.fileSize)})</span>
            </div>
            <button
              onClick={() => handleDownload(v.id, v.fileName)}
              className="text-indigo-600 hover:text-indigo-800 ml-3 shrink-0 flex items-center gap-1 font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'gallery';

export function DocumentList({ folderId, subDividerId }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const canEdit = isAdmin || user?.role === 'OFFICER';
  const qc = useQueryClient();

  const queryKey = ['documents', folderId, subDividerId];
  const queryParam = folderId ? `folderId=${folderId}` : `subDividerId=${subDividerId}`;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const { data: documents, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get<DocItem[]>(`/api/documents?${queryParam}`),
    enabled: !!(folderId || subDividerId),
    staleTime: 30_000,
  });

  const { data: expandedDoc } = useQuery({
    queryKey: ['document', expandedId],
    queryFn: () => api.get<DocDetail>(`/api/documents/${expandedId}`),
    enabled: !!expandedId,
    staleTime: 30_000,
  });

  const { data: docTypes = [] } = useQuery({
    queryKey: ['document-types'],
    queryFn: () => api.get<DocumentType[]>('/api/document-types'),
    staleTime: 60_000,
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/documents/${id}/status`, { status }),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey });
      if (expandedId) qc.invalidateQueries({ queryKey: ['document', expandedId] });
      toast.success(`Status → ${status.replace(/_/g, ' ').toLowerCase()}`);
    },
    onError: () => toast.error('Failed to update status'),
  });

  const deleteDoc = useMutation({
    mutationFn: (id: string) => api.delete(`/api/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      if (expandedId) setExpandedId(null);
      setConfirmDeleteId(null);
      toast.success('Document deleted');
    },
    onError: () => { setConfirmDeleteId(null); toast.error('Failed to delete document'); },
  });

  function handleDroppedFiles(files: File[]) {
    setDroppedFile(files[0]);
    setShowUpload(true);
  }

  const confirmTarget = documents?.find(d => d.id === confirmDeleteId);

  if (isLoading) {
    return (
      <div className="mt-4 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Documents {documents?.length ? `(${documents.length})` : ''}
        </h3>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          {(documents?.length ?? 0) > 0 && (
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('list')}
                title="List view"
                className={`p-1 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('gallery')}
                title="Gallery view"
                className={`p-1 rounded-md transition-colors ${viewMode === 'gallery' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              </button>
            </div>
          )}
          {canEdit && (
            <button
              onClick={() => setShowUpload(v => !v)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {showUpload ? 'Cancel' : 'Upload'}
            </button>
          )}
        </div>
      </div>

      {/* Upload form */}
      {showUpload && canEdit && (
        <div className="mb-4 p-4 bg-white border border-indigo-100 rounded-xl shadow-sm">
          <p className="text-xs font-semibold text-gray-700 mb-3">Upload Document</p>
          <UploadForm
            folderId={folderId}
            subDividerId={subDividerId}
            docTypes={docTypes}
            initialFile={droppedFile ?? undefined}
            queryKey={queryKey}
            onDone={() => { setShowUpload(false); setDroppedFile(null); }}
          />
        </div>
      )}

      {/* Document list / gallery / empty */}
      {!documents?.length ? (
        canEdit ? (
          <DropZone onFiles={handleDroppedFiles} />
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <svg className="w-10 h-10 text-gray-200" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-xs">No documents in this folder</p>
          </div>
        )
      ) : viewMode === 'gallery' ? (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {documents.map(doc => (
              <DocCard
                key={doc.id}
                doc={doc}
                expanded={expandedId === doc.id}
                expandedDoc={expandedId === doc.id ? expandedDoc ?? null : null}
                onExpand={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                onDelete={() => setConfirmDeleteId(doc.id)}
                onChangeStatus={status => changeStatus.mutate({ id: doc.id, status })}
                canEdit={canEdit}
                isAdmin={isAdmin ?? false}
              />
            ))}
            {canEdit && (
              <div
                onClick={() => setShowUpload(true)}
                className="h-full min-h-[8rem] flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/20 text-gray-400 hover:text-indigo-500 transition-colors"
              >
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs font-medium">Upload</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="space-y-2">
            {documents.map(doc => (
              <DocRow
                key={doc.id}
                doc={doc}
                expanded={expandedId === doc.id}
                expandedDoc={expandedId === doc.id ? expandedDoc ?? null : null}
                onExpand={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                onDelete={() => setConfirmDeleteId(doc.id)}
                onChangeStatus={status => changeStatus.mutate({ id: doc.id, status })}
                canEdit={canEdit}
                isAdmin={isAdmin ?? false}
              />
            ))}
          </div>
          {/* Drop zone below list for additional uploads */}
          {canEdit && !showUpload && (
            <div className="mt-3">
              <DropZone onFiles={handleDroppedFiles} />
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete document?"
        description={confirmTarget ? `"${confirmTarget.title}" and all versions will be permanently removed.` : undefined}
        confirmLabel="Delete"
        onConfirm={() => confirmDeleteId && deleteDoc.mutate(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
        loading={deleteDoc.isPending}
      />
    </div>
  );
}

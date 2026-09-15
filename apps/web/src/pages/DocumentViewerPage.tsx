import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiUpload } from '../lib/api-client';
import { useAuth } from '../lib/auth';
import { DocumentStatusBadge, ALLOWED_DOC_TRANSITIONS } from '../components/DocumentStatusBadge';
import { PdfAnnotator } from '../components/PdfAnnotator';
import { ESignatureModal } from '../components/ESignatureModal';
import { StartWorkflowModal } from '../components/StartWorkflowModal';

interface DocVersion {
  id: string;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

interface DocDetail {
  id: string;
  title: string;
  status: string;
  ocrText: string | null;
  checkedOutBy: { id: string; firstName: string; lastName: string } | null;
  documentType: { id: string; name: string } | null;
  versions: DocVersion[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function DocumentViewerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'OFFICER';

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [showSignModal, setShowSignModal] = useState(false);
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);

  const { data: doc, isLoading } = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.get<DocDetail>(`/api/documents/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });

  const activeVersion =
    doc?.versions.find(v => v.id === selectedVersionId) ?? doc?.versions[0];

  const { data: downloadData } = useQuery({
    queryKey: ['document-url', id, activeVersion?.id],
    queryFn: () =>
      api.get<{ url: string; fileName: string; mimeType: string }>(
        `/api/documents/${id}/versions/${activeVersion!.id}/download`,
      ),
    enabled: !!(id && activeVersion?.id),
    staleTime: 600_000, // signed URL valid 15 min
    gcTime: 600_000,
  });

  const changeStatus = useMutation({
    mutationFn: (status: string) =>
      api.patch(`/api/documents/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['document', id] }),
  });

  async function handleNewVersion(bytes: Uint8Array) {
    if (!id || !doc) return;
    setSavingVersion(true);
    try {
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const file = new File([blob], `${doc.title} (annotated).pdf`, {
        type: 'application/pdf',
      });
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', doc.title);
      await apiUpload(`/api/documents/${id}/versions`, fd);
      await qc.invalidateQueries({ queryKey: ['document', id] });
      await qc.invalidateQueries({ queryKey: ['document-url', id] });
      setSelectedVersionId(null); // will auto-select new latest
    } finally {
      setSavingVersion(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        Loading document…
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500 text-sm">
        Document not found.
      </div>
    );
  }

  const isPdf = activeVersion?.mimeType === 'application/pdf';
  const isImage = activeVersion?.mimeType.startsWith('image/') ?? false;

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-white shrink-0 z-10">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-500 hover:text-gray-800 text-sm font-medium shrink-0"
        >
          ← Back
        </button>

        <div className="w-px h-5 bg-gray-200 shrink-0" />

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-gray-900 truncate">{doc.title}</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <DocumentStatusBadge status={doc.status} />
            {doc.documentType && (
              <span className="text-xs text-gray-400">{doc.documentType.name}</span>
            )}
            {doc.checkedOutBy && (
              <span className="text-xs text-orange-500">
                Checked out by {doc.checkedOutBy.firstName} {doc.checkedOutBy.lastName}
              </span>
            )}
          </div>
        </div>

        {/* Status transitions */}
        {canEdit && (ALLOWED_DOC_TRANSITIONS[doc.status]?.length ?? 0) > 0 && (
          <div className="flex gap-1 shrink-0">
            {ALLOWED_DOC_TRANSITIONS[doc.status].map(next => (
              <button
                key={next}
                onClick={() => changeStatus.mutate(next)}
                disabled={changeStatus.isPending}
                className="px-2.5 py-1 text-xs font-medium border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                → {next.replace('_', ' ')}
              </button>
            ))}
          </div>
        )}

        {canEdit && (
          <button
            onClick={() => setShowWorkflowModal(true)}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shrink-0 transition-colors"
          >
            ⚙ Workflow
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => setShowSignModal(true)}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shrink-0 transition-colors"
          >
            ✍ Sign
          </button>
        )}
      </header>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Version sidebar */}
        <aside className="w-48 border-r border-gray-200 overflow-y-auto shrink-0 bg-gray-50">
          <div className="p-3 space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Versions
              </p>
              <div className="space-y-1">
                {doc.versions.map(v => {
                  const isActive =
                    selectedVersionId === v.id ||
                    (!selectedVersionId && v.id === doc.versions[0]?.id);
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVersionId(v.id)}
                      className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                        isActive
                          ? 'bg-blue-100 text-blue-800 font-medium'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <div className="font-semibold">v{v.versionNumber}</div>
                      <div className="text-gray-400 truncate max-w-full">{v.fileName}</div>
                      <div className="text-gray-400">{formatBytes(v.fileSize)}</div>
                      <div className="text-gray-400">
                        {new Date(v.createdAt).toLocaleDateString()}
                      </div>
                    </button>
                  );
                })}
              </div>
              {savingVersion && (
                <p className="text-xs text-blue-500 mt-2">Saving new version…</p>
              )}
            </div>

            {doc.ocrText && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  OCR Text
                </p>
                <p className="text-xs text-gray-600 bg-white rounded p-2 border border-gray-100 max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                  {doc.ocrText}
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* ── Viewer ────────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-hidden">
          {!downloadData ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              {activeVersion ? 'Loading…' : 'No versions available.'}
            </div>
          ) : isPdf ? (
            <PdfAnnotator url={downloadData.url} onNewVersion={handleNewVersion} />
          ) : isImage ? (
            <div className="flex items-center justify-center h-full p-6 overflow-auto bg-gray-100">
              <img
                src={downloadData.url}
                alt={doc.title}
                className="max-w-full max-h-full object-contain shadow-lg rounded"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
              <span className="text-5xl">📄</span>
              <p className="text-sm">Preview not available for {activeVersion?.mimeType}.</p>
              <a
                href={downloadData.url}
                download={activeVersion?.fileName}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                ↓ Download File
              </a>
            </div>
          )}
        </main>
      </div>

      {showWorkflowModal && doc && (
        <StartWorkflowModal
          documentId={doc.id}
          documentTitle={doc.title}
          onClose={() => setShowWorkflowModal(false)}
        />
      )}
      {showSignModal && (
        <ESignatureModal
          documentId={doc.id}
          documentTitle={doc.title}
          onClose={() => setShowSignModal(false)}
        />
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../lib/api-client';
import { useAuth } from '../lib/auth';
import { Layout } from '../components/Layout';

interface FileRequestFile { fileNumber: string; customerName: string; status: string; currentLocation?: string }
interface FileRequestUser { firstName: string; lastName: string; email: string }
interface FileRequest {
  id: string;
  department: string;
  purpose?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  notes?: string;
  createdAt: string;
  file: FileRequestFile;
  requestedBy: FileRequestUser;
}
interface FileLookup { id: string; fileNumber: string; customerName: string; status: string }
interface PagedRequests { data: FileRequest[]; total: number; page: number; totalPages: number }

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

function NewRequestModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [fileSearch, setFileSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileLookup | null>(null);
  const [department, setDepartment] = useState('');
  const [purpose, setPurpose] = useState('');

  const { data: fileResults } = useQuery({
    queryKey: ['file-search', fileSearch],
    queryFn: () => api.get<{ data: FileLookup[] }>(`/api/inventory?search=${encodeURIComponent(fileSearch)}&pageSize=8`),
    enabled: fileSearch.length > 1,
    staleTime: 10_000,
  });

  const mutation = useMutation({
    mutationFn: () => api.post('/api/file-requests', { fileId: selectedFile!.id, department, purpose }),
    onSuccess: () => {
      toast.success('File request submitted');
      qc.invalidateQueries({ queryKey: ['file-requests'] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to submit request'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">New File Request</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          {/* File search */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Search File</label>
            <input
              value={selectedFile ? `${selectedFile.fileNumber} — ${selectedFile.customerName}` : fileSearch}
              onChange={e => { setFileSearch(e.target.value); setSelectedFile(null); }}
              placeholder="Type file number or customer name…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {!selectedFile && fileResults?.data && fileResults.data.length > 0 && (
              <div className="border border-gray-200 rounded-lg mt-1 divide-y divide-gray-100 max-h-40 overflow-y-auto shadow-sm">
                {fileResults.data.map(f => (
                  <button key={f.id} onClick={() => { setSelectedFile(f); setFileSearch(''); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2">
                    <span className="font-medium text-gray-800">{f.fileNumber}</span>
                    <span className="text-gray-500 truncate">{f.customerName}</span>
                    <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${f.status === 'AVAILABLE' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{f.status}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Department <span className="text-red-500">*</span></label>
            <input value={department} onChange={e => setDepartment(e.target.value)} placeholder="Your department" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Purpose</label>
            <textarea value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Reason for requesting this file…" rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !selectedFile || !department}
              className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg"
            >
              {mutation.isPending ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusActions({ request, onDone }: { request: FileRequest; onDone: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isDeptUser = user?.role === 'DEPT_USER';

  const mutation = useMutation({
    mutationFn: (status: string) => api.patch(`/api/file-requests/${request.id}/status`, { status }),
    onSuccess: () => { toast.success('Request updated'); qc.invalidateQueries({ queryKey: ['file-requests'] }); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to update'),
  });

  if (request.status !== 'PENDING') return null;

  return (
    <div className="flex gap-1.5">
      {!isDeptUser && (
        <>
          <button onClick={() => mutation.mutate('APPROVED')} className="px-2.5 py-1 text-[11px] font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-md border border-green-200">Approve</button>
          <button onClick={() => mutation.mutate('REJECTED')} className="px-2.5 py-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-md border border-red-200">Reject</button>
        </>
      )}
      {isDeptUser && (
        <button onClick={() => mutation.mutate('CANCELLED')} className="px-2.5 py-1 text-[11px] font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md border border-gray-200">Cancel</button>
      )}
    </div>
  );
}

export function FileRequestsPage() {
  const { user } = useAuth();
  const isDeptUser = user?.role === 'DEPT_USER';
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [showNew, setShowNew] = useState(false);
  const [actionTarget, setActionTarget] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['file-requests', statusFilter],
    queryFn: () => api.get<PagedRequests>(`/api/file-requests?status=${statusFilter}&pageSize=50`),
    staleTime: 15_000,
  });

  const requests = data?.data ?? [];

  return (
    <Layout>
      <div className="h-full overflow-y-auto bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-5">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{isDeptUser ? 'My File Requests' : 'File Requests'}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {isDeptUser ? 'Request physical files from the registry' : 'Pending requests from department users'}
              </p>
            </div>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm"
            >
              <span className="text-lg leading-none">+</span> New Request
            </button>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-6">
          {/* Status tabs */}
          <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
            {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {s}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-white rounded-xl animate-pulse" />)}</div>
          ) : requests.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-sm font-medium">No {statusFilter.toLowerCase()} requests</p>
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map(r => (
                <div key={r.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{r.file.fileNumber}</span>
                      <span className="text-sm text-gray-500 truncate">{r.file.customerName}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                      {r.file.status === 'DISPATCHED' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">File Dispatched</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400 flex-wrap">
                      <span>Dept: {r.department}</span>
                      {r.purpose && <span className="truncate max-w-xs">Purpose: {r.purpose}</span>}
                      {!isDeptUser && <span>By: {r.requestedBy.firstName} {r.requestedBy.lastName}</span>}
                      <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <StatusActions request={r} onDone={() => setActionTarget(null)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showNew && <NewRequestModal onClose={() => setShowNew(false)} />}
    </Layout>
  );
}

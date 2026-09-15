import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../lib/api-client';
import { StatusBadge } from '../components/StatusBadge';
import { Layout } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { DispatchModal } from '../components/DispatchModal';
import { ReturnModal } from '../components/ReturnModal';
import { EditFileModal } from '../components/EditFileModal';

interface Movement {
  id: string;
  action: string;
  fromLocation: string | null;
  toLocation: string | null;
  notes: string | null;
  createdAt: string;
}

interface FileDetail {
  id: string;
  fileNumber: string;
  customerName: string;
  status: string;
  currentLocation: string | null;
  volumeNumber: number;
  branchId: string;
  businessUnitId: string;
  dateCreated: string;
  createdAt: string;
  movements: Movement[];
  branch: { name: string; code: string };
  businessUnit: { name: string; code: string };
  dispatches: { id: string; dispatchedTo: string; department: string; createdAt: string }[];
}

// DISPATCHED/RETURNED are handled by dedicated dispatch endpoints, not the generic status change.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  AVAILABLE:  ['ARCHIVED', 'MISSING'],
  DISPATCHED: ['MISSING'],
  RETURNED:   ['AVAILABLE', 'ARCHIVED'],
  ARCHIVED:   ['AVAILABLE'],
  MISSING:    ['AVAILABLE', 'ARCHIVED'],
};

export function FileDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [newStatus, setNewStatus] = useState('');
  const [reason, setReason] = useState('');
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newLocation, setNewLocation] = useState('');
  const [locationNotes, setLocationNotes] = useState('');

  const { data: file, isLoading } = useQuery({
    queryKey: ['file', id],
    queryFn: () => api.get<FileDetail>(`/api/inventory/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: (dto: { status: string; reason?: string }) =>
      api.patch(`/api/inventory/${id}/status`, dto),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['file', id] });
      queryClient.invalidateQueries({ queryKey: ['files'] });
      setNewStatus('');
      setReason('');
      toast.success(`Status changed to ${status.replace(/_/g, ' ').toLowerCase()}`);
    },
    onError: () => toast.error('Failed to update status'),
  });

  if (isLoading) {
    return <Layout><div className="p-6 text-center text-gray-400 mt-20">Loading…</div></Layout>;
  }
  if (!file) {
    return <Layout><div className="p-6 text-center text-gray-400 mt-20">File not found</div></Layout>;
  }

  const transitions = ALLOWED_TRANSITIONS[file.status] ?? [];
  const canChangeStatus = transitions.length > 0 && (user?.role !== 'DEPT_USER');

  return (
    <Layout>
      <div className="p-6">
        {/* Back + Title */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/inventory')}
            className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
          >
            ← Inventory
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">{file.fileNumber}</h1>
          <StatusBadge status={file.status} />
          {user?.role !== 'DEPT_USER' && (
            <button
              onClick={() => setShowEditModal(true)}
              title="Edit file details"
              className="ml-1 text-gray-400 hover:text-blue-600 transition-colors p-1 rounded"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
              </svg>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Details card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">File Details</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                {[
                  { label: 'Customer Name',    value: file.customerName },
                  { label: 'File Number',      value: file.fileNumber },
                  { label: 'Volume',           value: String(file.volumeNumber) },
                  { label: 'Current Location', value: file.currentLocation ?? '—' },
                  { label: 'Business Unit',    value: `${file.businessUnit.name} (${file.businessUnit.code})` },
                  { label: 'Branch',           value: `${file.branch.name} (${file.branch.code})` },
                  { label: 'Date Created',     value: new Date(file.dateCreated).toLocaleDateString() },
                  { label: 'Registered At',    value: new Date(file.createdAt).toLocaleString() },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
                    <dd className="mt-1 text-sm text-gray-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Movement History */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Movement History</h2>
              {file.movements.length === 0 ? (
                <p className="text-sm text-gray-400">No movements recorded yet</p>
              ) : (
                <div className="space-y-4">
                  {file.movements.map((m, i) => (
                    <div key={m.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1 ${i === 0 ? 'bg-blue-500' : 'bg-gray-300'}`} />
                        {i < file.movements.length - 1 && (
                          <div className="w-px flex-1 bg-gray-200 mt-1" />
                        )}
                      </div>
                      <div className="pb-4 flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {m.action.replace(/_/g, ' ')}
                        </p>
                        {(m.fromLocation || m.toLocation) && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {m.fromLocation && `From: ${m.fromLocation}`}
                            {m.fromLocation && m.toLocation && ' → '}
                            {m.toLocation && `To: ${m.toLocation}`}
                          </p>
                        )}
                        {m.notes && <p className="text-xs text-gray-500 mt-0.5 italic">{m.notes}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(m.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column — Actions + Status Change */}
          <div className="space-y-4">
            {user?.role !== 'DEPT_USER' && (file.status === 'AVAILABLE' || file.status === 'DISPATCHED') && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-fit">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Actions</h2>
                {file.status === 'AVAILABLE' && (
                  <button
                    onClick={() => setShowDispatchModal(true)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
                  >
                    Dispatch File
                  </button>
                )}
                {file.status === 'DISPATCHED' && (
                  <div className="space-y-3">
                    {file.dispatches[0] && (
                      <p className="text-xs text-gray-500">
                        Dispatched to <span className="font-medium text-gray-700">{file.dispatches[0].dispatchedTo}</span>
                        {' '}({file.dispatches[0].department}) on{' '}
                        {new Date(file.dispatches[0].createdAt).toLocaleDateString()}
                      </p>
                    )}
                    <button
                      onClick={() => setShowReturnModal(true)}
                      disabled={!file.dispatches[0]}
                      className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
                    >
                      Record Return
                    </button>
                  </div>
                )}
              </div>
            )}

            {canChangeStatus && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-fit">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Change Status</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">New Status</label>
                    <select
                      value={newStatus}
                      onChange={e => setNewStatus(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select…</option>
                      {transitions.map(s => (
                        <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason (optional)</label>
                    <textarea
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      rows={3}
                      placeholder="Briefly describe the reason for this change…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {statusMutation.isError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <p className="text-xs text-red-700">
                        {(statusMutation.error as any)?.message ?? 'Failed to update status'}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() =>
                      statusMutation.mutate({ status: newStatus, reason: reason || undefined })
                    }
                    disabled={!newStatus || statusMutation.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
                  >
                    {statusMutation.isPending ? 'Updating…' : 'Update Status'}
                  </button>
                </div>
              </div>
            )}
            {user?.role !== 'DEPT_USER' && file.status !== 'DISPATCHED' && (
              <RelocateCard
                fileId={file.id}
                newLocation={newLocation}
                notes={locationNotes}
                onLocationChange={setNewLocation}
                onNotesChange={setLocationNotes}
                onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['file', id] }); setNewLocation(''); setLocationNotes(''); }}
              />
            )}
          </div>
        </div>
      </div>

      {showDispatchModal && file && (
        <DispatchModal
          fileId={file.id}
          fileNumber={file.fileNumber}
          onClose={() => setShowDispatchModal(false)}
        />
      )}

      {showReturnModal && file?.dispatches[0] && (
        <ReturnModal
          dispatchId={file.dispatches[0].id}
          fileNumber={file.fileNumber}
          fileId={file.id}
          onClose={() => setShowReturnModal(false)}
        />
      )}

      <EditFileModal
        open={showEditModal}
        file={file}
        onClose={() => setShowEditModal(false)}
      />
    </Layout>
  );
}

interface RelocateCardProps {
  fileId: string;
  newLocation: string;
  notes: string;
  onLocationChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onSuccess: () => void;
}

function RelocateCard({ fileId, newLocation, notes, onLocationChange, onNotesChange, onSuccess }: RelocateCardProps) {
  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/tracking/files/${fileId}/location`, {
        location: newLocation,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      onSuccess();
      toast.success('Location updated');
    },
    onError: () => toast.error('Failed to update location'),
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-fit">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Relocate</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">New Location</label>
          <input
            type="text"
            value={newLocation}
            onChange={e => onLocationChange(e.target.value)}
            placeholder="e.g. Cabinet A, Shelf 3"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            placeholder="Reason for relocation"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {mutation.isError && (
          <p className="text-xs text-red-600">
            {(mutation.error as any)?.message ?? 'Failed to update location'}
          </p>
        )}
        <button
          onClick={() => mutation.mutate()}
          disabled={!newLocation.trim() || mutation.isPending}
          className="w-full bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
        >
          {mutation.isPending ? 'Updating…' : 'Update Location'}
        </button>
      </div>
    </div>
  );
}

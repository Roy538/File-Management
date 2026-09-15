import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

interface Signer {
  email: string;
  name: string;
}

interface ESignatureRequest {
  id: string;
  status: string;
  signers: Signer[];
  createdAt: string;
  completedAt?: string | null;
}

interface Props {
  documentId: string;
  documentTitle: string;
  onClose: () => void;
}

const STATUS_CLASSES: Record<string, string> = {
  PENDING: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  COMPLETED: 'text-green-700 bg-green-50 border-green-200',
  DECLINED: 'text-red-700 bg-red-50 border-red-200',
  EXPIRED: 'text-gray-600 bg-gray-50 border-gray-200',
};

export function ESignatureModal({ documentId, documentTitle, onClose }: Props) {
  const qc = useQueryClient();
  const [signers, setSigners] = useState<Signer[]>([{ email: '', name: '' }]);
  const [expiresAt, setExpiresAt] = useState('');

  const { data: requests } = useQuery({
    queryKey: ['esignature', documentId],
    queryFn: () => api.get<ESignatureRequest[]>(`/api/documents/${documentId}/esignature`),
    staleTime: 30_000,
  });

  const createRequest = useMutation({
    mutationFn: (body: { documentId: string; signers: Signer[]; expiresAt?: string }) =>
      api.post('/api/esignature', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['esignature', documentId] });
      setSigners([{ email: '', name: '' }]);
      setExpiresAt('');
    },
  });

  const cancelRequest = useMutation({
    mutationFn: (id: string) => api.patch(`/api/esignature/${id}/cancel`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['esignature', documentId] }),
  });

  function addSigner() {
    setSigners(s => [...s, { email: '', name: '' }]);
  }

  function removeSigner(i: number) {
    setSigners(s => s.filter((_, idx) => idx !== i));
  }

  function updateSigner(i: number, field: keyof Signer, value: string) {
    setSigners(s => s.map((x, idx) => (idx === i ? { ...x, [field]: value } : x)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valid = signers.filter(s => s.email.trim() && s.name.trim());
    if (!valid.length) return;
    createRequest.mutate({
      documentId,
      signers: valid,
      ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900">E-Signature Request</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{documentTitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Previous requests */}
          {requests && requests.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Previous Requests
              </p>
              <div className="space-y-2">
                {requests.map(req => (
                  <div key={req.id} className="flex items-start justify-between p-2.5 border rounded-lg">
                    <div className="space-y-1 min-w-0">
                      <span
                        className={`inline-block text-xs font-medium px-2 py-0.5 rounded border ${STATUS_CLASSES[req.status] ?? ''}`}
                      >
                        {req.status}
                      </span>
                      <p className="text-xs text-gray-500 truncate">
                        {(req.signers as Signer[]).map(s => s.email).join(', ')}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(req.createdAt).toLocaleDateString()}
                        {req.completedAt &&
                          ` · Completed ${new Date(req.completedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    {req.status === 'PENDING' && (
                      <button
                        onClick={() => cancelRequest.mutate(req.id)}
                        disabled={cancelRequest.isPending}
                        className="text-xs text-red-500 hover:text-red-700 shrink-0 ml-3"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New request form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">New Request</p>

            <div className="space-y-2">
              {signers.map((signer, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="email"
                    placeholder="Email"
                    value={signer.email}
                    onChange={e => updateSigner(i, 'email', e.target.value)}
                    required
                    className="flex-1 border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="Full name"
                    value={signer.name}
                    onChange={e => updateSigner(i, 'name', e.target.value)}
                    required
                    className="flex-1 border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {signers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSigner(i)}
                      className="text-red-400 hover:text-red-600 text-lg leading-none shrink-0"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addSigner}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                + Add Signer
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Expiry Date (optional)
              </label>
              <input
                type="date"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className="border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {createRequest.isError && (
              <p className="text-xs text-red-600">Failed to send request. Please try again.</p>
            )}

            <button
              type="submit"
              disabled={createRequest.isPending}
              className="w-full py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition-colors"
            >
              {createRequest.isPending ? 'Sending…' : 'Send Signature Request'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

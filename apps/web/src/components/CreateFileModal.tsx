import { useState, useEffect, FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../lib/api-client';
import { useAuth } from '../lib/auth';

interface BU { id: string; name: string; code: string; }
interface Branch { id: string; name: string; code: string; }

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateFileModal({ open, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [fileNumber, setFileNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [volumeNumber, setVolumeNumber] = useState('');
  const [currentLocation, setCurrentLocation] = useState('');
  const [buId, setBuId] = useState(user?.businessUnitId ?? '');
  const [branchId, setBranchId] = useState(user?.branchId ?? '');

  const [businessUnits, setBusinessUnits] = useState<BU[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    if (!open) return;
    if (!isAdmin) return;
    api.get<BU[]>('/api/auth/business-units').then(setBusinessUnits).catch(() => {});
  }, [open, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !buId) { setBranches([]); return; }
    api.get<Branch[]>(`/api/auth/business-units/${buId}/branches`)
      .then(b => { setBranches(b); setBranchId(''); })
      .catch(() => setBranches([]));
  }, [buId, isAdmin]);

  const mutation = useMutation({
    mutationFn: (body: object) => api.post('/api/inventory', body),
    onSuccess: () => {
      toast.success('File registered successfully');
      qc.invalidateQueries({ queryKey: ['inventory'] });
      handleClose();
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Failed to register file');
    },
  });

  const handleClose = () => {
    setFileNumber('');
    setCustomerName('');
    setVolumeNumber('');
    setCurrentLocation('');
    if (!isAdmin) {
      setBuId(user?.businessUnitId ?? '');
      setBranchId(user?.branchId ?? '');
    }
    onClose();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      fileNumber: fileNumber.trim(),
      customerName: customerName.trim(),
      ...(volumeNumber ? { volumeNumber: parseInt(volumeNumber, 10) } : {}),
      ...(currentLocation.trim() ? { currentLocation: currentLocation.trim() } : {}),
      businessUnitId: buId,
      branchId,
    });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Register New File</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {isAdmin && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Unit</label>
                <select
                  value={buId}
                  onChange={e => setBuId(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select business unit…</option>
                  {businessUnits.map(bu => (
                    <option key={bu.id} value={bu.id}>{bu.name} ({bu.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                <select
                  value={branchId}
                  onChange={e => setBranchId(e.target.value)}
                  required
                  disabled={!buId || branches.length === 0}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">Select branch…</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              File Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={fileNumber}
              onChange={e => setFileNumber(e.target.value)}
              required
              placeholder="e.g. FTS-2026-0001"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Customer Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              required
              placeholder="Full name or company"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Volume No.</label>
              <input
                type="number"
                value={volumeNumber}
                onChange={e => setVolumeNumber(e.target.value)}
                min={1}
                placeholder="1"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Location</label>
              <input
                type="text"
                value={currentLocation}
                onChange={e => setCurrentLocation(e.target.value)}
                placeholder="e.g. Shelf A-3"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !fileNumber.trim() || !customerName.trim() || (isAdmin && (!buId || !branchId))}
              className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition-colors"
            >
              {mutation.isPending ? 'Registering…' : 'Register File'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

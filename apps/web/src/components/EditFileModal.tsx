import { useState, useEffect, FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../lib/api-client';

interface FileDetail {
  id: string;
  fileNumber: string;
  customerName: string;
  volumeNumber: number;
  currentLocation: string | null;
}

interface Props {
  open: boolean;
  file: FileDetail | null;
  onClose: () => void;
}

export function EditFileModal({ open, file, onClose }: Props) {
  const qc = useQueryClient();

  const [customerName, setCustomerName] = useState('');
  const [volumeNumber, setVolumeNumber] = useState('');
  const [currentLocation, setCurrentLocation] = useState('');

  useEffect(() => {
    if (file) {
      setCustomerName(file.customerName);
      setVolumeNumber(String(file.volumeNumber || ''));
      setCurrentLocation(file.currentLocation ?? '');
    }
  }, [file]);

  const mutation = useMutation({
    mutationFn: (body: object) => api.patch(`/api/inventory/${file!.id}`, body),
    onSuccess: () => {
      toast.success('File details updated');
      qc.invalidateQueries({ queryKey: ['file', file!.id] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Failed to update file');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      customerName: customerName.trim(),
      ...(volumeNumber ? { volumeNumber: parseInt(volumeNumber, 10) } : {}),
      ...(currentLocation.trim() ? { currentLocation: currentLocation.trim() } : {}),
    });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Edit File Details</h2>
            <p className="text-xs text-gray-400 mt-0.5">{file.fileNumber}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Customer Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              required
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

          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Changing the location here will also record a movement entry in the file's history.
          </p>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !customerName.trim()}
              className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition-colors"
            >
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

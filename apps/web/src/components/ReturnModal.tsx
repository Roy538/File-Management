import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../lib/api-client';

interface Props {
  dispatchId: string;
  fileNumber: string;
  fileId?: string;
  onClose: () => void;
}

export function ReturnModal({ dispatchId, fileNumber, fileId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [returnedBy, setReturnedBy] = useState('');
  const [condition, setCondition] = useState('Good');
  const [returnedToCorrectLocation, setReturnedToCorrectLocation] = useState(true);
  const [returnLocation, setReturnLocation] = useState('');
  const [actualLocation, setActualLocation] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/dispatches/${dispatchId}/return`, {
        returnedBy: returnedBy || undefined,
        condition,
        returnedToCorrectLocation,
        returnLocation: returnLocation || undefined,
        actualLocation: !returnedToCorrectLocation && actualLocation ? actualLocation : undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      if (fileId) {
        queryClient.invalidateQueries({ queryKey: ['file', fileId] });
        queryClient.invalidateQueries({ queryKey: ['files'] });
      }
      toast.success('Return recorded successfully');
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to record return'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Record Return</h2>
          <p className="text-xs text-gray-500 mt-0.5">{fileNumber}</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Returned By</label>
            <input
              type="text"
              value={returnedBy}
              onChange={e => setReturnedBy(e.target.value)}
              placeholder="Name of person returning the file"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Condition of File</label>
            <select
              value={condition}
              onChange={e => setCondition(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
              <option value="Poor">Poor</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Returned to correct location?
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={returnedToCorrectLocation}
                  onChange={() => setReturnedToCorrectLocation(true)}
                  className="accent-blue-600"
                />
                <span className="text-sm text-gray-700">Yes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!returnedToCorrectLocation}
                  onChange={() => setReturnedToCorrectLocation(false)}
                  className="accent-blue-600"
                />
                <span className="text-sm text-gray-700">No</span>
              </label>
            </div>
          </div>

          {returnedToCorrectLocation ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Filing Location (optional)</label>
              <input
                type="text"
                value={returnLocation}
                onChange={e => setReturnLocation(e.target.value)}
                placeholder="e.g. Cabinet A, Shelf 3, Box 7"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
              <p className="text-xs font-medium text-amber-700">Officers will be notified of this wrong-location return.</p>
              <div>
                <label className="block text-xs font-medium text-amber-800 mb-1">Actual Location Filed</label>
                <input
                  type="text"
                  value={actualLocation}
                  onChange={e => setActualLocation(e.target.value)}
                  placeholder="Where was the file actually placed?"
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional remarks…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {mutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-xs text-red-700">{(mutation.error as any)?.message ?? 'Failed to record return'}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-300 rounded-lg transition-colors"
          >
            {mutation.isPending ? 'Recording…' : 'Confirm Return'}
          </button>
        </div>
      </div>
    </div>
  );
}

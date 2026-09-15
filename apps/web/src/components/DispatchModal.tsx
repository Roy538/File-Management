import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../lib/api-client';

interface Props {
  fileId: string;
  fileNumber: string;
  onClose: () => void;
}

export function DispatchModal({ fileId, fileNumber, onClose }: Props) {
  const queryClient = useQueryClient();
  const [dispatchedTo, setDispatchedTo] = useState('');
  const [department, setDepartment] = useState('');
  const [reason, setReason] = useState('');
  const [expectedReturnAt, setExpectedReturnAt] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/dispatches/file/${fileId}`, {
        dispatchedTo,
        department,
        reason: reason || undefined,
        expectedReturnAt: expectedReturnAt || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file', fileId] });
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      toast.success('File dispatched successfully');
      onClose();
    },
    onError: () => toast.error('Failed to dispatch file'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Dispatch File</h2>
          <p className="text-xs text-gray-500 mt-0.5">{fileNumber}</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Dispatched To <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={dispatchedTo}
              onChange={e => setDispatchedTo(e.target.value)}
              placeholder="Person or department name"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Department <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={department}
              onChange={e => setDepartment(e.target.value)}
              placeholder="e.g. Legal, Accounts, HR"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Optional reason for dispatch"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Expected Return Date
            </label>
            <input
              type="date"
              value={expectedReturnAt}
              onChange={e => setExpectedReturnAt(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {mutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-xs text-red-700">
                {(mutation.error as any)?.message ?? 'Failed to dispatch file'}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!dispatchedTo.trim() || !department.trim() || mutation.isPending}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition-colors"
          >
            {mutation.isPending ? 'Dispatching…' : 'Dispatch File'}
          </button>
        </div>
      </div>
    </div>
  );
}
